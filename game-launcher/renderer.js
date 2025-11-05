import * as THREE from "three"
import * as POSTPROCESSING from "postprocessing"
import RAPIER from '@dimforge/rapier3d-compat';
import Stats from 'stats.js'

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

await RAPIER.init()

window.canvas = document.querySelector("canvas")
window.debug = {}

export async function initializeScene()
{
    console.groupCollapsed("Initializing Scene")
    
    // WebGL Check
    function isWebGLAvailable()
    {
        try
        {
            const canvas = document.createElement('canvas');
            return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
        }
        catch(e) { return false; }
    }
    if (!isWebGLAvailable())
    {
        console.error("WebGL not supported or disabled!");
        console.groupEnd();
        console.error("Scene initialization failed...")
        return
    }
    console.log("Using %c"+(canvas.getContext('webgl2')?"WebGL 2":"WebGL"), "font-weight: bold")

    // Renderer
    window.renderer = new THREE.WebGLRenderer
    ({
        alpha: true,
        canvas: window.canvas, 
        powerPreference: "high-performance",
        premultipliedAlpha: false,
        depth: false,
        stencil: false,
        antialias: true,
        preserveDrawingBuffer: false
    });
    window.renderer.autoClear = false;
    window.renderer.shadowMap.enabled = true;
    window.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    console.log("Renderer:", window.renderer)

    // Main Elements
    window.scene = new THREE.Scene();
    window.mainCamera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.1, 1000 );

    console.log("Scene:", window.scene)
    console.log("Main Camera:", window.mainCamera)

    // Post Processing
    window.composer = new POSTPROCESSING.EffectComposer(window.renderer)
    window.composer.addPass(new POSTPROCESSING.RenderPass(window.scene, window.mainCamera));

    let effectPass = new POSTPROCESSING.EffectPass(window.mainCamera,
        new POSTPROCESSING.SSAOEffect(window.mainCamera),
        new POSTPROCESSING.FXAAEffect(),
        new POSTPROCESSING.BloomEffect({intensity: 1})
    )
    effectPass.renderToScreen = true
    window.composer.addPass(effectPass)

    console.log("Composer:", window.composer)

    // Window Resize
    let resizeListeners = []
    window.addResizeListener = function(l)
    {
        let index = resizeListeners.length;
        resizeListeners.push(l)
        return () => {resizeListeners.splice(index, 1)  }
    }

    const resizeElement = () =>
    {
        const width = Math.max(1, window.innerWidth || 800);
        const height = Math.max(1, window.innerHeight || 600);

        window.canvas.width = width;
        window.canvas.height = height;

        window.renderer.setSize(width, height);
        window.renderer.setPixelRatio(Math.max(1, window.devicePixelRatio || 1));
        window.composer.setSize(width, height)

        window.mainCamera.aspect = width / height;
        window.mainCamera.updateProjectionMatrix();

        for(let l of resizeListeners) { l(width, height) }
    }
    window.addEventListener("resize", resizeElement);
    resizeElement();

    console.log("Resize event ready")

    // Physic
    window.pausedPhysic = false;
    window.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    window.eventQueue = new RAPIER.EventQueue(true);

    console.log("Physic World:", window.world)

    // Render
    window.disabledRendering = false;
    const clock = new THREE.Clock();

    const mbStats = new Stats()
    mbStats.showPanel(2)
    document.body.appendChild(mbStats.dom)
    mbStats.dom.style.top = "56px"

    const fpsStats = new Stats()
    fpsStats.showPanel(0)
    document.body.appendChild(fpsStats.dom)
    fpsStats.dom.style.top = "112px"

    let renderListeners = []
    window.addRenderListener = function(l, before = false)
    {
        let index = renderListeners.length;
        renderListeners.push({f: l, before})
        return () => {renderListeners.splice(index, 1)  }
    }

    const frustum = new THREE.Frustum();
    const projectionScreenMatrix = new THREE.Matrix4();

    window.renderer.setAnimationLoop(() =>
    {
        mbStats.begin()
        fpsStats.begin()

        // Physic
        if(!window.pausedPhysic)
        {
            window.world.timestep = clock.getDelta()*1.5
            window.world.step();
        }

        for(let l of renderListeners) { if(l.before) { l.f(clock, frustum) } }

        // Render
        if(!window.disabledRendering)
        {
            if(window.composer) { window.composer.render(clock.getDelta()) }
            else { window.renderer.render( window.scene, window.mainCamera ) }
        }

        // Frustrum 
        window.mainCamera.updateMatrixWorld();
        window.mainCamera.matrixWorldInverse.copy(window.mainCamera.matrixWorld).invert();
        projectionScreenMatrix.multiplyMatrices(window.mainCamera.projectionMatrix, window.mainCamera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projectionScreenMatrix);
        
        for(let l of renderListeners) { if(!l.before) { l.f(clock, frustum) } }

        fpsStats.end()
        mbStats.end()
    });

    console.log("Render loop ready")

    // Pointer Tracker
    window.pointer = new THREE.Vector2();
    document.addEventListener("pointermove", (event) =>
    {
        window.pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
        window.pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
    })

    console.log("Pointer track ready")

    // Mouse
    window.mouseLeftPressed = false
    window.mouseRightPressed = false
    document.addEventListener("mousedown", (ev) =>
    {
        if(ev.button == 0){window.mouseLeftPressed = true}
        if(ev.button == 2){window.mouseRightPressed = true}
    })
    document.addEventListener("mouseup", (ev) =>
    {
        if(ev.button == 0){window.mouseLeftPressed = false}
        if(ev.button == 2){window.mouseRightPressed = false}
    })
    window.shiftKey = false;
    window.ctrlKey = false;
    document.addEventListener("keydown", (ev) =>
    {
        if(ev.shiftKey){window.shiftKey = true}
        if(ev.ctrlKey){window.ctrlKey = true}
    })
    document.addEventListener("keyup", (ev) =>
    {
        if(!ev.shiftKey){window.shiftKey = false}
        if(!ev.ctrlKey){window.ctrlKey = false}
    })

    console.log("Input listeners ready")

    console.groupEnd()
    console.log("%cScene Initialized", "color: green")
}

window.debug.isFreeCamera = false;
window.debug.freeCamera = function(raycatsEvent = null)
{
    if(window.debug.disableFreeCamera)
    {
        console.log("Free Camera Already Enabled")
        return;
    }

    console.log("Free Camera Mode %cEnabled", "color: green")

    let ogRenderingState = window.disabledRendering
    window.disabledRendering = true;
    let freeCamera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);

    const controls = new OrbitControls( freeCamera, canvas );
    controls.update();
    controls.target = window.mainCamera.position

    let axisHelper = new THREE.AxesHelper(1024);
    window.scene.add(axisHelper)
    let grid = new THREE.GridHelper(1024, 1024/16);
    grid.position.setY(-0.1)
    window.scene.add(grid)
    let cameraHelper = new THREE.CameraHelper(window.mainCamera)
    window.scene.add(cameraHelper)

    freeCamera.position.setZ(-10)

    const raycaster = new THREE.Raycaster();

    let removeRendererListener = window.addRenderListener((clock) =>
    {
        controls.update(clock.getDelta());
        cameraHelper.update()
        window.renderer.render(window.scene, freeCamera);

        // Raycast
        raycatsEvent && raycaster.setFromCamera( window.pointer, freeCamera );
        raycatsEvent && raycatsEvent(raycaster.intersectObjects( window.scene.children.filter(c=>c.visible&&c.geometry) )[0])
    })
    let removeResizeListener = window.addResizeListener((w, h) =>
    {
        freeCamera.aspect = w / h;
        freeCamera.updateProjectionMatrix();
    })

    window.debug.disableFreeCamera = () =>
    {
        console.log("Free Camera Mode %cDisabled", "color: red")

        removeRendererListener();
        removeResizeListener();
        freeCamera.removeFromParent()
        axisHelper.removeFromParent()
        grid.removeFromParent()
        cameraHelper.removeFromParent()

        window.disabledRendering = ogRenderingState;

        delete window.debug.disableFreeCamera;
    }
}

window.debug.enabledPhysicView = function()
{
    let debugMesh = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true })
    );
    debugMesh.frustumCulled = false;
    window.scene.add(debugMesh);

    let removeRendererListener = window.addRenderListener((clock) =>
    {
        const debugRenderer = window.world.debugRender()

        debugMesh.geometry.setAttribute('position', new THREE.BufferAttribute(debugRenderer.vertices, 3));
        debugMesh.geometry.setAttribute('color', new THREE.BufferAttribute(debugRenderer.colors, 4));
        debugMesh.geometry.attributes.position.needsUpdate = true;
        debugMesh.visible = true;
    })

    window.debug.disabledPhysicView = () =>
    {
        removeRendererListener();
        debugMesh.removeFromParent();
    }
}