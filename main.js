"use strict";

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

	const depthVS = `#version 300 es
	in vec4 a_position;

	uniform mat4 u_projection;
	uniform mat4 u_view;
	uniform mat4 u_world;

	void main() {
		gl_Position = u_projection * u_view * u_world * a_position;
	}
	`;

	const depthFS = `#version 300 es
	precision highp float;

	out float fragDepth;

	void main() {
		fragDepth = gl_FragCoord.z;
	}
	`;

async function main() {
	const canvas = document.querySelector("#canvas");
	const gl = canvas.getContext("webgl2");
	if (!gl) {
	  return;
	}
  
	// Tell the twgl to match position with a_position etc..
	twgl.setAttributePrefix("a_");

	// compiles and links the shaders, looks up attribute and uniform locations
	const meshProgramInfo = twgl.createProgramInfo(gl, [vs, fs]);
	const depthProgramInfo = twgl.createProgramInfo(gl, [depthVS, depthFS]);

	let buildingsPath = [
		'./assets/base.obj',
		'./assets/building_A.obj',
		'./assets/building_B.obj',
		'./assets/building_C.obj',
		'./assets/building_D.obj',
		'./assets/building_E.obj',
		'./assets/building_F.obj',
		'./assets/building_G.obj',
		'./assets/building_H.obj',
	];

	let roadsPath = [
		'./assets/road_tsplit.obj',
		'./assets/road_junction.obj',
		'./assets/road_corner.obj',
		'./assets/road_straight.obj',
	]

	let othersObjPath = [
		'./assets/bush.obj',
		'./assets/trafficlight_A.obj',
		'./assets/bench.obj',
	];

	const objs = {
		buildings: await Promise.all(
			buildingsPath.map(path => loadObjModel(gl, meshProgramInfo, path))
		),
		roads: await Promise.all(
			roadsPath.map(path => loadObjModel(gl, meshProgramInfo, path))
		),
		others: await Promise.all(
			othersObjPath.map(path => loadObjModel(gl, meshProgramInfo, path))
		),
	}

	let rotate = 0;
	let randomRoads, roadsProbability = 0.7;
	let worldMatrix = [], worldLength = 5, cameraDistance = 15;

	const near = 5, far = 250, objLength = 2;
	const PI = Math.PI, rotate90 = PI / 2, rotate180 = PI, rotate270 = PI * 1.5;

	const depthTextureSize = 2048;
	const depthTexture = gl.createTexture();

	gl.bindTexture(gl.TEXTURE_2D, depthTexture);
	gl.texImage2D(gl.TEXTURE_2D, 0, 
		gl.DEPTH_COMPONENT32F, depthTextureSize,
		depthTextureSize, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null
	);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	const depthFramebuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, depthFramebuffer);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);

	function generateWorldMatrix() {
		randomRoads = new Set();
		const numRandomRoads = Math.floor(worldLength * 2);
		let attempts = 0, maxAttempts = worldLength * 10, roads = 0;

		while (roads < numRandomRoads && attempts < maxAttempts) {
			attempts++;
			if(Math.random() < roadsProbability) {
				let axis = Math.random() < 0.5 ? 'row' : 'col';
				let pos = Math.floor(Math.random() * (worldLength - 2)) + 2;
				
				if (axis === 'row') {
					if (!randomRoads.has(`row${pos-1}`) && !randomRoads.has(`row${pos+1}`) && !isNearEdge()) {
						randomRoads.add(`row${pos}`);
					}
				} else {
					if (!randomRoads.has(`col${pos-1}`) && !randomRoads.has(`col${pos+1}`) && !isNearEdge()) {
						randomRoads.add(`col${pos}`);
					}
				}

				function isNearEdge() {
					return (pos <= 1 || pos >= worldLength - 2)
				}
			}
			roads++;
		}

		for (let i = 0; i < worldLength; i++) {
			for (let j = 0; j < worldLength; j++) {
				let u_world = m4.translation(i * objLength, 0, j * objLength), obj;

				// debugger;
				if (isCornerRoad(i, j)) {
					({obj, u_world} = setRoadCorner(i, j));
				}
				else if (isEdgeIntersection(i, j)) {
					obj = objs.roads[0]; // road_tsplit
					u_world = rotateForEdgeIntersection(i, j, u_world);
				}
				else if (isCrossing(i, j)) {
					obj = objs.roads[1]; // road_junction
					if(Math.random() < 0.5) u_world = m4.yRotate(u_world, rotate90);
				}
				else if (isEdge(i) || isEdge(j)) {
					obj = objs.roads[3]; // road_straight
					if (isEdge(j)) u_world = m4.yRotate(u_world, rotate90);
				}
				else if (randomRoads.has(`row${i}`) || randomRoads.has(`col${j}`)) {
					obj = objs.roads[3];
					if (randomRoads.has(`col${j}`)) u_world = m4.yRotate(u_world, rotate90);
				}
				else {
					obj = chooseRandom(objs.buildings);
					
					// debugger;

					if (i > 0 && isRoad(i - 1, j)) {
						// Estrada acima
						u_world = m4.yRotate(u_world, rotate270);
					}
					else if (j < worldLength - 1 && isRoad(i, j + 1)) {
						// Estrada a direita
						u_world = m4.yRotate(u_world, 0);
					}
					else if (j > 0 && isRoad(i, j - 1)) {
						// Estrada a esquerda
						u_world = m4.yRotate(u_world, rotate180);
					}
					else if (i < worldLength - 1 && isRoad(i + 1, j)) {
						// Estrada abaixo
						u_world = m4.yRotate(u_world, rotate90);
					} 
				}

				// debugger;
				worldMatrix.push({obj, u_world});
			}
		}
	}

	generateWorldMatrix();

	function render(time) {
		time *= 0.0002;
	
		twgl.resizeCanvasToDisplaySize(gl.canvas);
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
		gl.enable(gl.DEPTH_TEST);
	
		const fieldOfViewRadians = degToRad(60);
		const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
		const projection = m4.perspective(fieldOfViewRadians, aspect, near, far);
	
		const up = [0, 1, 0];
		const worldCenter = worldLength * objLength / 2;

		let cameraTarget = [worldCenter, 0, worldCenter];
		let rotation = time;
		let cameraPosition = [
		worldCenter + Math.cos(rotation) * cameraDistance,
		cameraDistance / 3,
		worldCenter + Math.sin(rotation) * cameraDistance
		];

		const camera = m4.lookAt(cameraPosition, cameraTarget, up);
		const view = m4.inverse(camera);

		const lightPosition = [worldCenter, 20, worldCenter];
		const lightTarget = [worldCenter, 0, worldCenter];
		const lightDirection = m4.normalize(m4.subtractVectors(lightPosition, lightTarget));

		const lightProjectionMatrix = m4.perspective(fieldOfViewRadians, 1, 1, 100);
		const lightViewMatrix = m4.lookAt(lightPosition, lightTarget, up);

		renderShadowMap(lightProjectionMatrix, lightViewMatrix);
	
		const sharedUniforms = {
			u_lightDirection: lightDirection,
			u_view: view,
			u_projection: projection,
			u_viewWorldPosition: cameraPosition,
			u_shadowMap: depthTexture,
		};
	
		gl.useProgram(meshProgramInfo.program);
		twgl.setUniforms(meshProgramInfo, sharedUniforms);

		for (const {obj, u_world} of worldMatrix) {
			renderObj(obj, u_world);
		}

		requestAnimationFrame(render);
	}


	function renderObj(obj, u_world) {
		const { parts } = obj;
		// debugger;
		for (const {bufferInfo, vao, material} of parts) {
			gl.bindVertexArray(vao);
			twgl.setUniforms(meshProgramInfo, {
				u_world,
			}, material);
	
			twgl.drawBufferInfo(gl, bufferInfo);
		}
	}

	function renderShadowMap(lightProjectionMatrix, lightViewMatrix) {
		gl.bindFramebuffer(gl.FRAMEBUFFER, depthFramebuffer);
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
		gl.clear(gl.DEPTH_BUFFER_BIT);

		gl.useProgram(depthProgramInfo.program);
		twgl.setUniforms(depthProgramInfo, {
			u_projection: lightProjectionMatrix,
			u_view: lightViewMatrix,
		});

		for (const {obj, u_world} of worldMatrix) {
			const { parts } = obj;
			for (const {bufferInfo, vao} of parts) {
				gl.bindVertexArray(vao);
				twgl.setUniforms(depthProgramInfo, {
					u_world,
				});
				twgl.setBuffersAndAttributes(gl, depthProgramInfo, bufferInfo);
				twgl.drawBufferInfo(gl, bufferInfo);
			}
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	function chooseRandom(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	function isRoad(i, j) {
		return randomRoads.has(`row${i}`) || randomRoads.has(`col${j}`) || isEdge(i) || isEdge(j);
	}

	function isEdgeIntersection(i, j) {
		return (isEdge(i) && randomRoads.has(`col${j}`)) ||
			(isEdge(j) && randomRoads.has(`row${i}`));
	}
	
	function isCrossing(i, j) {
		return randomRoads.has(`row${i}`) && randomRoads.has(`col${j}`);
	}

	function rotateForEdgeIntersection(i, j, u_world) {
		if (isEdge(i) && randomRoads.has(`col${j}`)) {
			if (i == 0) return u_world;
			return m4.yRotate(u_world, rotate180);
		}
		else if (isEdge(j) && randomRoads.has(`row${i}`)) {
			if(j == 0) return m4.yRotate(u_world, rotate270);
			return m4.yRotate(u_world, rotate90);
		}
		return u_world;
	}

	function isEdge(x) {
		return x == 0 || x == worldLength - 1;
	}

	function isCornerRoad(i, j) {
		return (i == 0 && j == 0)
		|| (i == worldLength - 1 && j == 0)
		|| (i == 0 && j == worldLength - 1)
		|| (i == worldLength - 1 && j == worldLength - 1);
	}

	function setRoadCorner(i, j) {
		let obj = objs.roads[2],
		u_world = m4.translation(i * objLength, 0, j * objLength);

		if (i == 0 && j == 0) {
			return {obj, u_world};
		} else if (i == worldLength - 1 && j == 0) {
			return {obj, u_world: m4.yRotate(u_world, rotate270)};
		} else if (i == worldLength - 1 && j == worldLength - 1) {
			return {obj, u_world: m4.yRotate(u_world, rotate180)};
		} else if (i == 0 && j == worldLength - 1) {
			return {obj, u_world: m4.yRotate(u_world, rotate90)};
		}
	}

	webglLessonsUI.setupSlider("#mapLength",
		{value: worldLength, slide: updateWorldLength, min: 5, max: 100}
		);
	
		function updateWorldLength(event, ui) {
			worldLength = ui.value;
			worldMatrix = [];
			generateWorldMatrix();
		}
	
		webglLessonsUI.setupSlider("#cameraDistance",
		{value: cameraDistance, slide: updateCameraDistance, min: 10, max: 100}
		);
	
		function updateCameraDistance(event, ui) {
			cameraDistance = ui.value;
		}
	
		webglLessonsUI.setupSlider("#roadsProbability",
		{value: roadsProbability * 100, slide: updateRoadsProbability, min: 0, max: 100}
		);
	
		function updateRoadsProbability(event, ui) {
			roadsProbability = ui.value / 100;
			worldMatrix = [];
			generateWorldMatrix();
		}

		webglLessonsUI.setupSlider("#rotate",
		{value: rotate, slide: updateRotate, min: 0, max: 2 * Math.PI}
		);

		function updateRotate(event, ui) {
			rotate = ui.value;
		}

	requestAnimationFrame(render);
}



main();