import * as THREE from "three"
import * as POSTPROCESSING from "postprocessing"
import RAPIER from '@dimforge/rapier3d-compat';

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
    window.renderer.shadowMap.type = THREE.BasicShadowMap;

    console.log("Renderer:", window.renderer)

    // Main Elements
    window.scene = new THREE.Scene();
    window.mainCamera = new THREE.PerspectiveCamera( 40, window.innerWidth / window.innerHeight, 0.1, 1000 );

    console.log("Scene:", window.scene)
    console.log("Main Camera:", window.mainCamera)

    // Post Processing
    window.composer = new POSTPROCESSING.EffectComposer(window.renderer)
    window.composer.addPass(new POSTPROCESSING.RenderPass(window.scene, window.mainCamera));

    window.composer.addPass(new POSTPROCESSING.EffectPass(window.mainCamera,
        new POSTPROCESSING.SSAOEffect(window.mainCamera),
        new POSTPROCESSING.FXAAEffect(),
        new POSTPROCESSING.BloomEffect({intensity: 1})
    ))

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

    console.log("Physic World:", window.world)

    // Render
    window.disabledRendering = false;
    const clock = new THREE.Clock();

    let renderListeners = []
    window.addRenderListener = function(l)
    {
        let index = renderListeners.length;
        renderListeners.push(l)
        return () => {renderListeners.splice(index, 1)  }
    }

    window.renderer.setAnimationLoop(() =>
    {
        if(!window.pausedPhysic)
        {
            window.world.step();
        }
        if(!window.disabledRendering)
        {
            if(window.composer) { window.composer.render(clock.getDelta()) }
            else { window.renderer.render( window.scene, window.mainCamera ) }
        }
        
        for(let l of renderListeners) { l(clock) }
    });

    console.log("Render loop ready")


    console.log("%cScene Initialized", "color: green")
    console.groupEnd()
}

window.debug.isFreeCamera = false;
window.debug.freeCamera = function()
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

    let axisHelper = new THREE.AxesHelper(1);
    window.scene.add(axisHelper)
    let grid = new THREE.GridHelper(128, 128);
    window.scene.add(grid)

    freeCamera.position.setZ(-1)

    let removeRendererListener = window.addRenderListener((clock) =>
    {
        controls.update(clock.getDelta());
        window.renderer.render(window.scene, freeCamera);
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

        window.disabledRendering = ogRenderingState;

        delete window.debug.disableFreeCamera;
    }
}