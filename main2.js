// WebGL2 - load obj - w/mtl, textures
// from https://webgl2fundamentals.org/webgl/webgl-load-obj-w-mtl-w-textures.html


"use strict";

// This is not a full .obj parser.
// see http://paulbourke.net/dataformats/obj/

const vs = `#version 300 es
	in vec4 a_position;
	in vec3 a_normal;
	in vec2 a_texcoord;
	in vec4 a_color;
  
	uniform mat4 u_projection;
	uniform mat4 u_view;
	uniform mat4 u_world;
	uniform vec3 u_viewWorldPosition;
  
	out vec3 v_normal;
	out vec3 v_surfaceToView;
	out vec2 v_texcoord;
	out vec4 v_color;
  
	void main() {
	  vec4 worldPosition = u_world * a_position;
	  gl_Position = u_projection * u_view * worldPosition;
	  v_surfaceToView = u_viewWorldPosition - worldPosition.xyz;
	  v_normal = mat3(u_world) * a_normal;
	  v_texcoord = a_texcoord;
	  v_color = a_color;
	}
	`;
  
	const fs = `#version 300 es
	precision highp float;
  
	in vec3 v_normal;
	in vec3 v_surfaceToView;
	in vec2 v_texcoord;
	in vec4 v_color;
  
	uniform vec3 diffuse;
	uniform sampler2D diffuseMap;
	uniform vec3 ambient;
	uniform vec3 emissive;
	uniform vec3 specular;
	uniform float shininess;
	uniform float opacity;
	uniform vec3 u_lightDirection;
	uniform vec3 u_ambientLight;
  
	out vec4 outColor;
  
	void main () {
	  vec3 normal = normalize(v_normal);
  
	  vec3 surfaceToViewDirection = normalize(v_surfaceToView);
	  vec3 halfVector = normalize(u_lightDirection + surfaceToViewDirection);
  
	  float fakeLight = dot(u_lightDirection, normal) * .5 + .5;
	  float specularLight = clamp(dot(normal, halfVector), 0.0, 1.0);
  
	  vec4 diffuseMapColor = texture(diffuseMap, v_texcoord);
	  vec3 effectiveDiffuse = diffuse * diffuseMapColor.rgb * v_color.rgb;
	  float effectiveOpacity = opacity * diffuseMapColor.a * v_color.a;
  
	  outColor = vec4(
		  emissive +
		  ambient * u_ambientLight +
		  effectiveDiffuse * fakeLight +
		  specular * pow(specularLight, shininess),
		  effectiveOpacity);
	}
	`;


async function main() {
	// Get A WebGL context
	/** @type {HTMLCanvasElement} */
	const canvas = document.querySelector("#canvas");
	const gl = canvas.getContext("webgl2");
	if (!gl) {
	  return;
	}
  
	// Tell the twgl to match position with a_position etc..
	twgl.setAttributePrefix("a_");
  
	// compiles and links the shaders, looks up attribute and uniform locations
	const meshProgramInfo = twgl.createProgramInfo(gl, [vs, fs]);
  
	const base = 'http://localhost:5500';
  
	let objHrefs = [
	  base + '/assets/building_G.obj',
	  base + '/assets/building_A.obj',
	  base + '/assets/building_B.obj',
	  base + '/assets/building_C.obj',
	  base + '/assets/building_D.obj',
	//   base + '/assets/watertower.obj',
	];
  
	let objs = await Promise.all(objHrefs.map(href => loadObjModel(gl, meshProgramInfo, href)));
  
	const { center, radius } = calculateBoundingSphere(objs);

	const zNear = radius / 100;
	const zFar = radius * 50;

	let cameraAngle = [0, 0]; // Horizontal angle, Vertical angle
	let cameraDistance = radius * 2; // Initial distance from the center
	let cameraPosition;
	let cameraSpeed = 0.1;

	// Calcular o centro da esfera delimitadora
	let boundingSphereCenter = [0, 0, 0];
	if (objs.length > 0) {
		let min = [Infinity, Infinity, Infinity];
		let max = [-Infinity, -Infinity, -Infinity];

		for (const obj of objs) {
			let extents = obj.extents;
			for (let i = 0; i < 3; i++) {
			min[i] = Math.min(min[i], extents.min[i]);
			max[i] = Math.max(max[i], extents.max[i]);
			}
		}

		boundingSphereCenter = min.map((min, index) => (min + max[index]) / 2);
	}

	// Atualizar cameraTarget para o centro da esfera delimitadora
	let cameraTarget = boundingSphereCenter;

	updateCameraPosition();

	function updateCameraPosition() {
		debugger
		const direction = [
		  Math.sin(cameraAngle[0]) * Math.cos(cameraAngle[1]),
		  Math.sin(cameraAngle[1]),
		  Math.cos(cameraAngle[0]) * Math.cos(cameraAngle[1])
		];
	  
		// cameraPosition = direction.map((value) => center[value] + value * cameraDistance);
		cameraPosition = direction.map((value, index) => cameraTarget[index] + value * cameraDistance);
		console.log(cameraPosition)
	  }
	  
	  window.addEventListener('keydown', (event) => {
		switch (event.key) {
		  case 'ArrowUp': // Move forward
			cameraDistance -= cameraSpeed;
			break;
		  case 'ArrowDown': // Move backward
			cameraDistance += cameraSpeed;
			break;
		  case 'ArrowLeft': // Rotate left
			cameraAngle[0] -= cameraSpeed;
			console.log(cameraAngle[0])
			break;
		  case 'ArrowRight': // Rotate right
			cameraAngle[0] += cameraSpeed;
			break;
		  case 'w': // Tilt up
			cameraAngle[1] = Math.max(-Math.PI / 2, cameraAngle[1] - cameraSpeed);
			break;
		  case 's': // Tilt down
			cameraAngle[1] = Math.min(Math.PI / 2, cameraAngle[1] + cameraSpeed);
			break;
		}
		updateCameraPosition();
	  });

 
	function degToRad(deg) {
	  return deg * Math.PI / 180;
	}
    
  
	function render(time) {
  
	  twgl.resizeCanvasToDisplaySize(gl.canvas);
	  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	  gl.enable(gl.DEPTH_TEST);
  
	  const fieldOfViewRadians = degToRad(60);
	  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
	  const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);
  
	  const up = [0, 1, 0];
	  const camera = m4.lookAt(cameraPosition, cameraTarget, up);
	  const view = m4.inverse(camera);
  
	  const sharedUniforms = {
		u_lightDirection: m4.normalize([-1, 3, 5]),
		u_view: view,
		u_projection: projection,
		u_viewWorldPosition: cameraPosition,
	  };
  
	  gl.useProgram(meshProgramInfo.program);
  
	  twgl.setUniforms(meshProgramInfo, sharedUniforms);

	let maxHeight = 0;

	for (const obj of objs) {
		let extents = obj.extents;
		let range = m4.subtractVectors(extents.max, extents.min);
		if (range[1] > maxHeight) {
			maxHeight = range[1]; // Atualiza maxHeight com a altura do objeto mais alto
		}
	}

	  let xOffset = 0;
	  for (const obj of objs) {
		  let u_world = m4.identity();
  
		  let extents = obj.extents;
		  let range = m4.subtractVectors(extents.max, extents.min);
		  let offset = m4.scaleVector(
			m4.addVectors(
			  extents.min,
			  m4.scaleVector(range, 0.5)),
			-1);

		let yAdjustment = (maxHeight - range[1]) / 2; // Ajuste de altura para que todos os objetos fiquem na mesma altura
  
		  u_world = m4.translate(u_world, xOffset + offset[0], offset[1] - yAdjustment, offset[2]);
  
		  for (const {bufferInfo, vao, material} of obj.parts) {
			gl.bindVertexArray(vao);
			twgl.setUniforms(meshProgramInfo, {
			  u_world,
			}, material);
			twgl.drawBufferInfo(gl, bufferInfo);
		  }

		  xOffset += range[0] + Math.abs(offset[0]);
	  }
  
	  requestAnimationFrame(render);
	}
  
	requestAnimationFrame(render);
}


function calculateBoundingSphere(objs) {
	let min = [Infinity, Infinity, Infinity];
	let max = [-Infinity, -Infinity, -Infinity];
  
	objs.forEach(obj => {
	  min = min.map((value, index) => Math.min(value, obj.extents.min[index]));
	  max = max.map((value, index) => Math.max(value, obj.extents.max[index]));
	});
  
	const center = min.map((min, index) => (min + max[index]) / 2);
	const radius = Math.sqrt(max.reduce((acc, max, index) => {
	  const distance = max - center[index];
	  return acc + distance * distance;
	}, 0));
  
	return { center, radius };
  }


function parseOBJ(text) {
	// because indices are base 1 let's just fill in the 0th data
	const objPositions = [[0, 0, 0]];
	const objTexcoords = [[0, 0]];
	const objNormals = [[0, 0, 0]];
	const objColors = [[0, 0, 0]];
  
	// same order as `f` indices
	const objVertexData = [
	  objPositions,
	  objTexcoords,
	  objNormals,
	  objColors,
	];
  
	// same order as `f` indices
	let webglVertexData = [
	  [],   // positions
	  [],   // texcoords
	  [],   // normals
	  [],   // colors
	];
  
	const materialLibs = [];
	const geometries = [];
	let geometry;
	let groups = ['default'];
	let material = 'default';
	let object = 'default';
  
	const noop = () => {};
  
	function newGeometry() {
	  // If there is an existing geometry and it's
	  // not empty then start a new one.
	  if (geometry && geometry.data.position.length) {
		geometry = undefined;
	  }
	}
  
	function setGeometry() {
	  if (!geometry) {
		const position = [];
		const texcoord = [];
		const normal = [];
		const color = [];
		webglVertexData = [
		  position,
		  texcoord,
		  normal,
		  color,
		];
		geometry = {
		  object,
		  groups,
		  material,
		  data: {
			position,
			texcoord,
			normal,
			color,
		  },
		};
		geometries.push(geometry);
	  }
	}
  
	function addVertex(vert) {
	  const ptn = vert.split('/');
	  ptn.forEach((objIndexStr, i) => {
		if (!objIndexStr) {
		  return;
		}
		const objIndex = parseInt(objIndexStr);
		const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
		webglVertexData[i].push(...objVertexData[i][index]);
		// if this is the position index (index 0) and we parsed
		// vertex colors then copy the vertex colors to the webgl vertex color data
		if (i === 0 && objColors.length > 1) {
		  geometry.data.color.push(...objColors[index]);
		}
	  });
	}
  
	const keywords = {
	  v(parts) {
		// if there are more than 3 values here they are vertex colors
		if (parts.length > 3) {
		  objPositions.push(parts.slice(0, 3).map(parseFloat));
		  objColors.push(parts.slice(3).map(parseFloat));
		} else {
		  objPositions.push(parts.map(parseFloat));
		}
	  },
	  vn(parts) {
		objNormals.push(parts.map(parseFloat));
	  },
	  vt(parts) {
		// should check for missing v and extra w?
		objTexcoords.push(parts.map(parseFloat));
	  },
	  f(parts) {
		setGeometry();
		const numTriangles = parts.length - 2;
		for (let tri = 0; tri < numTriangles; ++tri) {
		  addVertex(parts[0]);
		  addVertex(parts[tri + 1]);
		  addVertex(parts[tri + 2]);
		}
	  },
	  s: noop,    // smoothing group
	  mtllib(parts, unparsedArgs) {
		// the spec says there can be multiple filenames here
		// but many exist with spaces in a single filename
		materialLibs.push(unparsedArgs);
	  },
	  usemtl(parts, unparsedArgs) {
		material = unparsedArgs;
		newGeometry();
	  },
	  g(parts) {
		groups = parts;
		newGeometry();
	  },
	  o(parts, unparsedArgs) {
		object = unparsedArgs;
		newGeometry();
	  },
	};
  
	const keywordRE = /(\w*)(?: )*(.*)/;
	const lines = text.split('\n');
	for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
	  const line = lines[lineNo].trim();
	  if (line === '' || line.startsWith('#')) {
		continue;
	  }
	  const m = keywordRE.exec(line);
	  if (!m) {
		continue;
	  }
	  const [, keyword, unparsedArgs] = m;
	  const parts = line.split(/\s+/).slice(1);
	  const handler = keywords[keyword];
	  if (!handler) {
		console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
		continue;
	  }
	  handler(parts, unparsedArgs);
	}
  
	// remove any arrays that have no entries.
	for (const geometry of geometries) {
	  geometry.data = Object.fromEntries(
		  Object.entries(geometry.data).filter(([, array]) => array.length > 0));
	}
  
	return {
	  geometries,
	  materialLibs,
	};
}
  
function parseMapArgs(unparsedArgs) {
	// TODO: handle options
	return unparsedArgs;
  }
  
function parseMTL(text) {
	const materials = {};
	let material;
  
	const keywords = {
	  newmtl(parts, unparsedArgs) {
		material = {};
		materials[unparsedArgs] = material;
	  },
	  /* eslint brace-style:0 */
	  Ns(parts)       { material.shininess      = parseFloat(parts[0]); },
	  Ka(parts)       { material.ambient        = parts.map(parseFloat); },
	  Kd(parts)       { material.diffuse        = parts.map(parseFloat); },
	  Ks(parts)       { material.specular       = parts.map(parseFloat); },
	  Ke(parts)       { material.emissive       = parts.map(parseFloat); },
	  map_Kd(parts, unparsedArgs)   { material.diffuseMap = parseMapArgs(unparsedArgs); },
	  map_Ns(parts, unparsedArgs)   { material.specularMap = parseMapArgs(unparsedArgs); },
	  map_Bump(parts, unparsedArgs) { material.normalMap = parseMapArgs(unparsedArgs); },
	  Ni(parts)       { material.opticalDensity = parseFloat(parts[0]); },
	  d(parts)        { material.opacity        = parseFloat(parts[0]); },
	  illum(parts)    { material.illum          = parseInt(parts[0]); },
	};
  
	const keywordRE = /(\w*)(?: )*(.*)/;
	const lines = text.split('\n');
	for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
	  const line = lines[lineNo].trim();
	  if (line === '' || line.startsWith('#')) {
		continue;
	  }
	  const m = keywordRE.exec(line);
	  if (!m) {
		continue;
	  }
	  const [, keyword, unparsedArgs] = m;
	  const parts = line.split(/\s+/).slice(1);
	  const handler = keywords[keyword];
	  if (!handler) {
		console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
		continue;
	  }
	  handler(parts, unparsedArgs);
	}
  
	return materials;
}

async function loadObjModel(gl, meshProgramInfo, objPath) {
	const response = await fetch(objPath);
	const text = await response.text();
	const obj = parseOBJ(text);
	const baseHref = new URL(objPath, window.location.href);
	const matTexts = await Promise.all(obj.materialLibs.map(async filename => {
	  const matHref = new URL(filename, baseHref).href;
	  const response = await fetch(matHref);
	  return await response.text();
	}));
	const materials = parseMTL(matTexts.join('\n'));
  
	const textures = {
	  defaultWhite: twgl.createTexture(gl, { src: [255, 255, 255, 255] }),
	};
  
	// load texture for materials
	for (const material of Object.values(materials)) {
	  Object.entries(material)
		.filter(([key]) => key.endsWith('Map'))
		.forEach(([key, filename]) => {
		  let texture = textures[filename];
		  if (!texture) {
			const textureHref = new URL(filename, baseHref).href;
			texture = twgl.createTexture(gl, { src: textureHref, flipY: true });
			textures[filename] = texture;
		  }
		  material[key] = texture;
		});
	}
  
	const defaultMaterial = {
	  diffuse: [1, 1, 1],
	  diffuseMap: textures.defaultWhite,
	  ambient: [0, 0, 0],
	  specular: [1, 1, 1],
	  shininess: 400,
	  opacity: 1,
	};
  
	const parts = obj.geometries.map(({ material, data }) => {
	  if (data.color) {
		if (data.position.length === data.color.length) {
		  data.color = { numComponents: 3, data: data.color };
		}
	  } else {
		data.color = { value: [1, 1, 1, 1] };
	  }
  
	  const bufferInfo = twgl.createBufferInfoFromArrays(gl, data);
	  const vao = twgl.createVAOFromBufferInfo(gl, meshProgramInfo, bufferInfo);
	  return {
		material: {
		  ...defaultMaterial,
		  ...materials[material],
		},
		bufferInfo,
		vao,
	  };
	});

	const extents = getGeometriesExtents(obj.geometries);
	let range, offset;

	return { parts, range, offset, extents };
}

function getExtents(positions) {
	const min = positions.slice(0, 3);
	const max = positions.slice(0, 3);
	for (let i = 3; i < positions.length; i += 3) {
	  for (let j = 0; j < 3; ++j) {
		const v = positions[i + j];
		min[j] = Math.min(v, min[j]);
		max[j] = Math.max(v, max[j]);
	  }
	}
	return { min, max };
  }

  function getGeometriesExtents(geometries) {
	return geometries.reduce(({ min, max }, { data }) => {
	  const minMax = getExtents(data.position);
	  return {
		min: min.map((min, ndx) => Math.min(minMax.min[ndx], min)),
		max: max.map((max, ndx) => Math.max(minMax.max[ndx], max)),
	  };
	}, {
	  min: Array(3).fill(Number.POSITIVE_INFINITY),
	  max: Array(3).fill(Number.NEGATIVE_INFINITY),
	});
  }



main();
