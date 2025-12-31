import * as THREE from "three"
import * as POSTPROCESSING from "postprocessing"
import RAPIER from '@dimforge/rapier3d-compat';
import Stats from 'stats.js'

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

await RAPIER.init()

// window.canvas = document.querySelector("canvas")
window.debug = {}

export async function initializeScene(canvas = null, global = true, windowSize = true, useStats = false)
{
    console.groupCollapsed("Initializing Scene")

    if(!canvas)
    {
        console.log("No canvas prevised, using global canvas")
        canvas = window.canvas;
        if(!canvas)
        {
            console.warn("No global canvas, crating one")
            canvas = window.canvas = document.querySelector("canvas")
        }
    }
    
    // WebGL Check
    function isWebGLAvailable()
    {
        try
        {
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
    const renderer = new THREE.WebGLRenderer
    ({
        alpha: true,
        canvas: canvas, 
        powerPreference: "high-performance",
        depth: true,
        antialias: true,
    });
    renderer.autoClear = false;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.LinearToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    // renderer.useLegacyLights = true

    console.log("Renderer:", renderer)

    // Main Elements
    const scene = new THREE.Scene();
    const mainCamera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.1, 1000 );

    console.log("Scene:", scene)
    console.log("Main Camera:", mainCamera)

    // Post Processing
    const composer = new POSTPROCESSING.EffectComposer(renderer, { frameBufferType: THREE.UnsignedByteType })
    composer.addPass(new POSTPROCESSING.RenderPass(scene, mainCamera));

    let effectPass = new POSTPROCESSING.EffectPass(mainCamera,
        // new POSTPROCESSING.SSAOEffect(mainCamera),
        // new POSTPROCESSING.FXAAEffect(),
        // new POSTPROCESSING.BloomEffect
        // ({
        //     intensity: 1,
        //     luminanceThreshold: 0.9,
        //     luminanceSmoothing: 0.25,
        //     mipmapBlur: true
        // }),
        // new POSTPROCESSING.HueSaturationEffect
        // ({
        //     hue: 0.0,
        //     saturation: 0
        // }),
        // new POSTPROCESSING.BrightnessContrastEffect
        // ({
        //     brightness: 0.0,
        //     contrast: 0
        // })
    )
    effectPass.renderToScreen = true
    composer.addPass(effectPass)

    console.log("Composer:", composer)

    // Window Resize
    let resizeListeners = []
    const addResizeListener = function(l)
    {
        let index = resizeListeners.length;
        resizeListeners.push(l)
        return () => {resizeListeners.splice(index, 1)  }
    }

    const resizeElement = () =>
    {
        const width = windowSize ? Math.max(1, window.innerWidth || 800) : canvas.getBoundingClientRect().width;
        const height = windowSize ? Math.max(1, window.innerHeight || 600) : canvas.getBoundingClientRect().height;

        if(windowSize)
        {
            canvas.width = width;
            canvas.height = height;
        }

        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.max(1, (windowSize ? width/height : window.devicePixelRatio) || 1));
        composer.setSize(width, height)

        mainCamera.aspect = width / height;
        mainCamera.updateProjectionMatrix();

        for(let l of resizeListeners) { l(width, height) }
    }
    if(windowSize) { window.addEventListener("resize", resizeElement); }
    else { new ResizeObserver(resizeElement).observe(canvas) }
    resizeElement();

    console.log("Resize event ready")

    // Physic
    const pausedPhysic = false;
    const world = new RAPIER.World({ x: 0, y: -32, z: 0 });
    world.timestep = 1/20
    const eventQueue = new RAPIER.EventQueue(true);

    console.log("Physic World:", world)

    // Render
    let disabledRendering = false;
    const clock = new THREE.Clock();

    const mbStats = new Stats()
    const fpsStats = new Stats()
    if(useStats)
    {
        
        mbStats.showPanel(2)
        document.body.appendChild(mbStats.dom)
        mbStats.dom.style.top = "56px"

        
        fpsStats.showPanel(0)
        document.body.appendChild(fpsStats.dom)
        fpsStats.dom.style.top = "112px"
    }

    let renderListeners = []
    const addRenderListener = function(l, before = false)
    {
        let index = renderListeners.length;
        renderListeners.push({f: l, before})
        return () => {renderListeners.splice(index, 1)  }
    }

    const frustum = new THREE.Frustum();
    const projectionScreenMatrix = new THREE.Matrix4();

    renderer.setAnimationLoop(() =>
    {
        if(useStats)
        {
            mbStats.begin()
            fpsStats.begin()
        }

        // Physic
        if(!pausedPhysic)
        {
            // world.timestep = clock.getDelta()*1.5
            // world.step();
        }

        for(let l of renderListeners) { if(l.before) { l.f(clock, frustum) } }

        // Render
        if(!disabledRendering)
        {
            if(composer) { composer.render(clock.getDelta()) }
            else { renderer.render( scene, mainCamera ) }
        }

        // Frustrum 
        mainCamera.updateMatrixWorld();
        mainCamera.matrixWorldInverse.copy(mainCamera.matrixWorld).invert();
        projectionScreenMatrix.multiplyMatrices(mainCamera.projectionMatrix, mainCamera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projectionScreenMatrix);
        
        for(let l of renderListeners) { if(!l.before) { l.f(clock, frustum) } }

        if(useStats)
        {
            mbStats.end()
            fpsStats.end()
        }
    });

    console.log("Render loop ready")

    // Pointer Tracker
    const pointer = new THREE.Vector2();
    document.addEventListener("pointermove", (event) =>
    {
        pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
        pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
    })

    console.log("Pointer track ready")

    // Mouse
    if(!window.mouseLeftPressed || !window.mouseRightPressed)
    {
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
    }

    if(!window.shiftKey || !window.ctrlKey)
    {
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
    }

    console.log("Input listeners ready")

    if(global)
    {
        window.canvas = canvas
        window.scene = scene
        window.renderer = renderer
        window.mainCamera = mainCamera
        window.composer = composer
        window.world = world
        window.eventQueue = eventQueue
        window.pausedPhysic = pausedPhysic

        window.addRenderListener = addRenderListener
        window.disabledRendering = disabledRendering
        window.addResizeListener = addResizeListener

        window.pointer = pointer
    }

    console.groupEnd()
    console.log("%cScene Initialized", "color: green")
    
    if(!global)
    {
        return {
            canvas,
            scene,
            renderer,
            mainCamera,
            composer,
            world,
            eventQueue,
            pausedPhysic,

            addRenderListener,
            setDisabledRendering: (v) => {disabledRendering=v},
            addResizeListener,

            pointer,
        }
    }
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

    let ogRenderingState = disabledRendering
    disabledRendering = true;
    let freeCamera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);

    const controls = new OrbitControls( freeCamera, canvas );
    controls.update();
    // controls.target = mainCamera.position

    let axisHelper = new THREE.AxesHelper(1024);
    scene.add(axisHelper)
    let grid = new THREE.GridHelper(1024, 1024/16);
    grid.position.setY(-0.1)
    scene.add(grid)
    let cameraHelper = new THREE.CameraHelper(mainCamera)
    scene.add(cameraHelper)

    freeCamera.position.setZ(-10)

    const raycaster = new THREE.Raycaster();

    let removeRendererListener = addRenderListener((clock) =>
    {
        controls.update(clock.getDelta());
        cameraHelper.update()
        renderer.render(scene, freeCamera);

        // Raycast
        raycatsEvent && raycaster.setFromCamera( pointer, freeCamera );
        raycatsEvent && raycatsEvent(raycaster.intersectObjects( scene.children.filter(c=>c.visible&&c.geometry) )[0])
    })
    let removeResizeListener = addResizeListener((w, h) =>
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

        disabledRendering = ogRenderingState;

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
    scene.add(debugMesh);

    let removeRendererListener = addRenderListener((clock) =>
    {
        const debugRenderer = world.debugRender()

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