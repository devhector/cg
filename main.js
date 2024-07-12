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

	let objHrefs = [
		'./assets/building_G.obj',
		'./assets/building_A.obj',
		'./assets/building_B.obj',
		'./assets/building_C.obj',
		'./assets/building_D.obj',
		'./assets/road_tsplit.obj',
	];
  
	let objs = await Promise.all(
		objHrefs.map(href => loadObjModel(gl, meshProgramInfo, href))
	);

	const near = 5, far = 10000, objLength = 2;
	
	let worldMatrix = [], worldLength = 10;
	let worldCenter = [worldLength / 2, 0, worldLength / 2];
	let cameraDistance = 20;
	let cameraPosition = [(worldLength / 2), 10, (worldLength / 2) + cameraDistance];
	let cameraTarget = worldCenter;


	for (let i = 0; i < worldLength; i++) {
		for (let j = 0; j < worldLength; j++) {
			let u_world = m4.translation(i * objLength, 0, j * objLength);
			u_world = m4.yRotate(u_world, ((j) % 2) * Math.PI);


			worldMatrix.push(
				{obj: objs[i % objs.length], u_world}
			);
		}
	}

	function render(time) {
		time *= 0.0001;
	
		twgl.resizeCanvasToDisplaySize(gl.canvas);
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
		gl.enable(gl.DEPTH_TEST);
	
		const fieldOfViewRadians = degToRad(60);
		const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
		const projection = m4.perspective(fieldOfViewRadians, aspect, near, far);
	
		const up = [0, 1, 0];
		const orbitRadius = cameraDistance;
		const cameraAngleRadians = time;
		cameraPosition = [
			worldCenter[0] + Math.cos(cameraAngleRadians) * orbitRadius,
			6,
			worldCenter[2] + Math.sin(cameraAngleRadians) * orbitRadius,
		];

		const camera = m4.lookAt(cameraPosition, cameraTarget, up);
	
		// Make a view matrix from the camera matrix.
		const view = m4.inverse(camera);
	
		const sharedUniforms = {
			u_lightDirection: m4.normalize([-1, 3, 5]),
			u_view: view,
			u_projection: projection,
			u_viewWorldPosition: cameraPosition,
		};
	
		gl.useProgram(meshProgramInfo.program);
	
		// calls gl.uniform
		twgl.setUniforms(meshProgramInfo, sharedUniforms);

		for (const {obj, u_world} of worldMatrix) {
			renderObj(obj, u_world);
		}

		requestAnimationFrame(render);
	}
	requestAnimationFrame(render);

	function renderObj(obj, u_world) {
		const { parts } = obj;
	
		for (const {bufferInfo, vao, material} of parts) {
			gl.bindVertexArray(vao);
			twgl.setUniforms(meshProgramInfo, {
				u_world,
			}, material);
	
			twgl.drawBufferInfo(gl, bufferInfo);
		}
	}
}



main();