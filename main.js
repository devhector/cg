// WebGL2 - load obj - w/mtl, textures
// from https://webgl2fundamentals.org/webgl/webgl-load-obj-w-mtl-w-textures.html


"use strict";

// This is not a full .obj parser.
// see http://paulbourke.net/dataformats/obj/


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


  // compiles and links the shaders, looks up attribute and uniform locations
  const meshProgramInfo = twgl.createProgramInfo(gl, [vs, fs]);

  const objHref = 'http://localhost:4242/assets/building_G.obj';
  const obj = await loadObjModel(gl, meshProgramInfo, objHref);

  const cameraTarget = [0, 0, 0];
  // figure out how far away to move the camera so we can likely
  // see the object.
  const radius = m4.length(obj.range) * 1.2;
  const cameraPosition = m4.addVectors(cameraTarget, [
    0,
    0,
    radius,
  ]);
  // Set zNear and zFar to something hopefully appropriate
  // for the size of this object.
  const zNear = radius / 100;
  const zFar = radius * 3;

  // let cameraPosition = [0, 0, radius];
  // let cameraTarget = [0, 0, 0];
  let cameraSpeed = 0.1;
  let keys = {};


  window.addEventListener('keydown', (event) => {
    keys[event.key] = true;
  });

  window.addEventListener('keyup', (event) => {
    keys[event.key] = false;
  });

  function degToRad(deg) {
    return deg * Math.PI / 180;
  }

  let rotationAngleY = 0;
  let rotationSpeed = degToRad(1);


  function render(time) {

    if (keys['w']) {
      cameraPosition[2] -= cameraSpeed;
    }
    if (keys['s']) {
      cameraPosition[2] += cameraSpeed;
    }
    if (keys['a']) {
      cameraPosition[0] -= cameraSpeed;
    }
    if (keys['d']) {
      cameraPosition[0] += cameraSpeed;
    }

	if (keys['ArrowLeft']) {
		rotationAngleY -= rotationSpeed;
	  }
	  if (keys['ArrowRight']) {
		rotationAngleY += rotationSpeed;
	  }

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

    let u_world = m4.yRotation(rotationAngleY);
    u_world = m4.translate(u_world, ... obj.offset);

    for (const {bufferInfo, vao, material} of obj.parts) {
      gl.bindVertexArray(vao);
      twgl.setUniforms(meshProgramInfo, {
        u_world,
      }, material);
      twgl.drawBufferInfo(gl, bufferInfo);
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

main();
