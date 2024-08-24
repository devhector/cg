"use strict";


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
		  ...materials[material],
		},
		bufferInfo,
		vao,
	  };
	});

	const extents = getGeometriesExtents(obj.geometries);
	// debugger;
	return { parts };
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

function degToRad(deg) {
	return deg * Math.PI / 180;
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