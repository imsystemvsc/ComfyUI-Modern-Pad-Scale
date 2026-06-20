import { app } from "../../scripts/app.js";

const DEFAULT_STATE = {
    mode: "Aspect Ratio",
    rotation: 0,
    flip_h: false,
    flip_v: false,
    invert_mask: false,
    mask_grow: 0,
    target_aspect: "16:9",
    aspect_alignment: "Center",
    padding_style: "Solid Black",
    scaling_mode: "Megapixel Scaling",
    scale_to_megapixel: 1.0,
    manual_left: 0, manual_top: 0, manual_right: 0, manual_bottom: 0,
    exact_width: 1024, exact_height: 1024,
    crop_enabled: false,
    crop_left: 0.0, crop_top: 0.0, crop_right: 1.0, crop_bottom: 1.0
};

// Inject CSS for the Modern Dashboard
const style = document.createElement("style");
style.textContent = `
    .mps-root { background: #1e1e24; border: 2px dashed transparent; border-radius: 8px; padding: 12px; font-family: sans-serif; color: #e2e8f0; display: flex; flex-direction: column; gap: 10px; width: 100%; box-sizing: border-box; transition: background 0.2s, border-color 0.2s; }
    .mps-root:focus-within { border-color: #3b82f6; }
    .mps-dragover { background: #27272a !important; border-color: #3b82f6 !important; }
    .mps-btn { background: #3b82f6; border: none; border-radius: 4px; padding: 8px; color: white; cursor: pointer; font-weight: bold; text-align: center; transition: 0.1s; }
    .mps-btn:hover { background: #2563eb; }
    .mps-btn-outline { background: #27272a; border: 1px solid #3f3f46; border-radius: 4px; padding: 6px 2px; color: #d4d4d8; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 4px; font-size: 10px;}
    .mps-btn-outline:hover { background: #3f3f46; }
    .mps-row { display: flex; gap: 8px; }
    .mps-row > * { flex: 1; min-width: 0; }
    .mps-label { font-size: 10px; color: #a1a1aa; text-transform: uppercase; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
    .mps-select, .mps-input { width: 100%; background: #27272a; border: 1px solid #3f3f46; color: white; padding: 6px; border-radius: 4px; font-size: 12px; box-sizing: border-box;}
    .mps-select:focus, .mps-input:focus { outline: none; border-color: #3b82f6; }
    .mps-preview-container { background: #131315; border: 1px solid #27272a; border-radius: 6px; height: 160px; position: relative; overflow: hidden; display: flex; justify-content: center; align-items: center;}
    .mps-preview-text { font-size: 11px; color: #a1a1aa; text-align: center; margin-top: -4px; margin-bottom: 4px; }
    .mps-canvas { position: absolute; cursor: crosshair; }
    .mps-hidden { display: none !important; }
`;
document.head.appendChild(style);

app.registerExtension({
    name: "Imsystem.ModernPadScale",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "ModernPadAndScale") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                const node = this;
                
                node.color = "#1e1e24";   
                node.bgcolor = "#1e1e24"; 
                
                let nativeImageWidget = null;
                let stateWidget = null;
                
                if (this.widgets) {
                    this.widgets.forEach(w => {
                        if (w.name === "image") nativeImageWidget = w;
                        if (w.name === "ModernState") stateWidget = w;
                        if (w.type !== "custom") {
                            w.hidden = true;
                            w.computeSize = () => [0, -4];
                        }
                    });
                }

                const getState = () => {
                    try { return JSON.parse(stateWidget?.value || JSON.stringify(DEFAULT_STATE)); } 
                    catch (e) { return DEFAULT_STATE; }
                };

                const setState = (updates) => {
                    const current = getState();
                    if (stateWidget) {
                        stateWidget.value = JSON.stringify({ ...current, ...updates });
                    }
                    updateUI();
                    node.setDirtyCanvas(true, true);
                };

                Object.defineProperty(this, "imgs", {
                    get: function() { return undefined; }, 
                    set: function(v) { 
                        if (v && v[0] && v[0].naturalWidth) {
                            currentImg = v[0];
                            renderCanvas();
                        }
                        this.setDirtyCanvas(true, true); 
                    },
                    configurable: true
                });

                const root = document.createElement("div");
                root.className = "mps-root";
                root.setAttribute("tabindex", "0");
                root.innerHTML = `
                    <button class="mps-btn" id="mps-upload">Upload Image</button>
                    <input type="file" id="mps-file-input" accept="image/*" class="mps-hidden">
                    <div class="mps-preview-container"><canvas class="mps-canvas" id="mps-canvas"></canvas></div>
                    <div class="mps-preview-text" id="mps-dims">Awaiting Image...</div>
                    <div class="mps-row">
                        <button class="mps-btn-outline" id="mps-flip-h">↔ Flip H</button>
                        <button class="mps-btn-outline" id="mps-flip-v">↕ Flip V</button>
                        <button class="mps-btn-outline" id="mps-rot-left">⟲ -90°</button>
                        <button class="mps-btn-outline" id="mps-rot-right">+90° ⟳</button>
                    </div>
                    <div>
                        <div class="mps-label">Padding Mode</div>
                        <select class="mps-select" id="mps-mode">
                            <option>Aspect Ratio</option><option>Manual Pixels</option><option>Exact Pixels</option><option>No Padding</option>
                        </select>
                    </div>
                    <div id="mps-aspect-settings" class="mps-row">
                        <div><div class="mps-label">Target</div><select class="mps-select" id="mps-aspect"><option>1:1</option><option>16:9</option><option>9:16</option><option>4:3</option><option>3:4</option><option>21:9</option></select></div>
                        <div><div class="mps-label">Align</div><select class="mps-select" id="mps-align"><option>Center</option><option>Top</option><option>Bottom</option><option>Left</option><option>Right</option></select></div>
                    </div>
                    <div id="mps-manual-settings" class="mps-hidden mps-row">
                        <div><div class="mps-label">Left</div><input type="number" class="mps-input" id="mps-pad-l" value="0"></div>
                        <div><div class="mps-label">Top</div><input type="number" class="mps-input" id="mps-pad-t" value="0"></div>
                        <div><div class="mps-label">Right</div><input type="number" class="mps-input" id="mps-pad-r" value="0"></div>
                        <div><div class="mps-label">Bottom</div><input type="number" class="mps-input" id="mps-pad-b" value="0"></div>
                    </div>
                    <div id="mps-exact-settings" class="mps-hidden mps-row">
                        <div><div class="mps-label">Width</div><input type="number" class="mps-input" id="mps-exact-w" value="1024"></div>
                        <div><div class="mps-label">Height</div><input type="number" class="mps-input" id="mps-exact-h" value="1024"></div>
                    </div>
                    <div id="mps-color-box" class="mps-row">
                        <div><div class="mps-label">Padding Color</div><select class="mps-select" id="mps-color"><option>Solid Black</option><option>Solid Green</option><option>Latent Noise</option></select></div>
                    </div>
                    <div id="mps-scaling-row" class="mps-row">
                        <div><div class="mps-label">Scaling Mode</div><select class="mps-select" id="mps-scaling"><option>Megapixel Scaling</option><option>No Scaling</option></select></div>
                        <div id="mps-mp-box"><div class="mps-label">MP</div><input type="number" step="0.1" class="mps-input" id="mps-mp" value="1.0"></div>
                    </div>
                    <div class="mps-row">
                        <div style="flex:0.5;"><div class="mps-label">Invert Mask</div><button class="mps-btn-outline" style="padding: 6px; font-size:12px;" id="mps-invert-mask">False</button></div>
                        <div><div class="mps-label">Grow/Shrink</div><input type="number" class="mps-input" id="mps-mask-grow" value="0"></div>
                    </div>
                    <div class="mps-row">
                        <div><div class="mps-label">Interactive Crop Box</div><button class="mps-btn-outline" style="padding: 8px; font-size:12px;" id="mps-crop-enable">Disabled</button></div>
                    </div>
                `;

                const els = {
                    upload: root.querySelector("#mps-upload"), fileInput: root.querySelector("#mps-file-input"),
                    canvas: root.querySelector("#mps-canvas"), dims: root.querySelector("#mps-dims"),
                    flipH: root.querySelector("#mps-flip-h"), flipV: root.querySelector("#mps-flip-v"),
                    rotL: root.querySelector("#mps-rot-left"), rotR: root.querySelector("#mps-rot-right"),
                    mode: root.querySelector("#mps-mode"), aspectSettings: root.querySelector("#mps-aspect-settings"),
                    manualSettings: root.querySelector("#mps-manual-settings"), exactSettings: root.querySelector("#mps-exact-settings"),
                    aspect: root.querySelector("#mps-aspect"), align: root.querySelector("#mps-align"),
                    padL: root.querySelector("#mps-pad-l"), padT: root.querySelector("#mps-pad-t"),
                    padR: root.querySelector("#mps-pad-r"), padB: root.querySelector("#mps-pad-b"),
                    exactW: root.querySelector("#mps-exact-w"), exactH: root.querySelector("#mps-exact-h"),
                    colorBox: root.querySelector("#mps-color-box"), color: root.querySelector("#mps-color"),
                    scalingRow: root.querySelector("#mps-scaling-row"), scaling: root.querySelector("#mps-scaling"),
                    mpBox: root.querySelector("#mps-mp-box"), mp: root.querySelector("#mps-mp"),
                    invertMask: root.querySelector("#mps-invert-mask"), maskGrow: root.querySelector("#mps-mask-grow"),
                    cropEnable: root.querySelector("#mps-crop-enable")
                };

                let currentImg = new Image();
                let isDraggingCrop = false;
                let activeHandle = null; 
                let lastMouseX = 0, lastMouseY = 0;
                let layoutContext = { imgX: 0, imgY: 0, imgW: 0, imgH: 0 };

                const renderCanvas = () => {
                    if (!currentImg || !currentImg.naturalWidth) { els.dims.textContent = "Awaiting Image..."; return; }
                    const state = getState();
                    const ctx = els.canvas.getContext("2d");
                    const cw = 280; const ch = 150; els.canvas.width = cw; els.canvas.height = ch;
                    let rot = state.rotation;
                    
                    let origW = currentImg.naturalWidth; let origH = currentImg.naturalHeight;
                    let effW = (rot === 90 || rot === 270) ? origH : origW; let effH = (rot === 90 || rot === 270) ? origW : origH;
                    let pL = 0, pT = 0, pR = 0, pB = 0; let totW = effW; let totH = effH;
                    
                    if (state.mode === "Exact Pixels") { 
                        totW = parseInt(state.exact_width)||1024; 
                        totH = parseInt(state.exact_height)||1024; 
                    }
                    else if (state.mode === "Manual Pixels") { 
                        pL=parseInt(state.manual_left)||0; 
                        pT=parseInt(state.manual_top)||0; 
                        pR=parseInt(state.manual_right)||0; 
                        pB=parseInt(state.manual_bottom)||0; 
                        totW=effW+pL+pR; 
                        totH=effH+pT+pB; 
                    }
                    else if (state.mode === "Aspect Ratio") {
                        const ratios = { "1:1": 1.0, "16:9": 16/9, "9:16": 9/16, "4:3": 4/3, "3:4": 3/4, "21:9": 21/9 };
                        const targetRatio = ratios[state.target_aspect] || 1.0;
                        const currentRatio = effW / effH;
                        if (currentRatio > targetRatio) {
                            let newH = effW / targetRatio; let totalPad = newH - effH;
                            if (state.aspect_alignment === "Top") pB = totalPad;
                            else if (state.aspect_alignment === "Bottom") pT = totalPad;
                            else { pT = totalPad / 2; pB = totalPad - pT; }
                        } else {
                            let newW = effH * targetRatio; let totalPad = newW - effW;
                            if (state.aspect_alignment === "Left") pR = totalPad;
                            else if (state.aspect_alignment === "Right") pL = totalPad;
                            else { pL = totalPad / 2; pR = totalPad - pL; }
                        }
                        totW = effW + pL + pR; totH = effH + pT + pB;
                    }

                    let scale = Math.min((cw - 10) / totW, (ch - 10) / totH);
                    let drawW = totW * scale; let drawH = totH * scale;
                    let dX = (cw - drawW) / 2; let dY = (ch - drawH) / 2;
                    
                    let innerImgX = dX + (pL * scale);
                    let innerImgY = dY + (pT * scale);
                    let innerImgW = effW * scale;
                    let innerImgH = effH * scale;
                    
                    layoutContext = { imgX: innerImgX, imgY: innerImgY, imgW: innerImgW, imgH: innerImgH };

                    // Recalculated Canvas Render pipeline style to dynamically inject noise particles
                    if (state.padding_style === "Solid Green") {
                        ctx.fillStyle = "#00FF00";
                        ctx.fillRect(dX, dY, drawW, drawH);
                    } else if (state.padding_style === "Latent Noise") {
                        // Generates high-fidelity per-pixel custom grain loops inside the canvas element bounds
                        ctx.fillStyle = "#000000";
                        ctx.fillRect(dX, dY, drawW, drawH);
                        let noiseImg = ctx.createImageData(Math.ceil(drawW), Math.ceil(drawH));
                        for (let i = 0; i < noiseImg.data.length; i += 4) {
                            let grain = Math.floor(Math.random() * 255);
                            noiseImg.data[i] = grain;     // R
                            noiseImg.data[i+1] = grain;   // G
                            noiseImg.data[i+2] = grain;   // B
                            noiseImg.data[i+3] = 255;     // Alpha
                        }
                        ctx.putImageData(noiseImg, dX, dY);
                    } else {
                        ctx.fillStyle = "#000000";
                        ctx.fillRect(dX, dY, drawW, drawH);
                    }
                    
                    ctx.save();
                    if (state.mode === "Exact Pixels") {
                        ctx.translate(dX + drawW/2, dY + drawH/2);
                        ctx.scale(state.flip_h ? -1 : 1, state.flip_v ? -1 : 1);
                        if (rot === 90 || rot === 270) { ctx.drawImage(currentImg, -drawH/2, -drawW/2, drawH, drawW); }
                        else { ctx.drawImage(currentImg, -drawW/2, -drawH/2, drawW, drawH); }
                    } else {
                        ctx.translate(innerImgX + innerImgW/2, innerImgY + innerImgH/2);
                        ctx.rotate(rot * Math.PI / 180);
                        ctx.scale(state.flip_h ? -1 : 1, state.flip_v ? -1 : 1);
                        ctx.drawImage(currentImg, -(origW * scale)/2, -(origH * scale)/2, origW * scale, origH * scale);
                    }
                    ctx.restore();

                    if (state.crop_enabled) {
                        let bx = innerImgX + state.crop_left * innerImgW;
                        let by = innerImgY + state.crop_top * innerImgH;
                        let bw = (state.crop_right - state.crop_left) * innerImgW;
                        let bh = (state.crop_bottom - state.crop_top) * innerImgH;

                        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
                        ctx.fillRect(innerImgX, innerImgY, innerImgW, by - innerImgY);
                        ctx.fillRect(innerImgX, by, bx - innerImgX, bh);
                        ctx.fillRect(bx + bw, by, innerImgX + innerImgW - (bx + bw), bh);
                        ctx.fillRect(innerImgX, by + bh, innerImgW, innerImgY + innerImgH - (by + bh));

                        ctx.strokeStyle = "#3b82f6";
                        ctx.lineWidth = 2;
                        ctx.strokeRect(bx, by, bw, bh);

                        ctx.fillStyle = "#ffffff";
                        const hs = 6;
                        ctx.fillRect(bx - hs/2, by - hs/2, hs, hs);
                        ctx.fillRect(bx + bw - hs/2, by - hs/2, hs, hs);
                        ctx.fillRect(bx - hs/2, by + bh - hs/2, hs, hs);
                        ctx.fillRect(bx + bw - hs/2, by + bh - hs/2, hs, hs);
                    }
                    
                    let finalW=Math.round(totW), finalH=Math.round(totH);
                    if (state.mode !== "Exact Pixels" && state.scaling_mode !== "No Scaling") {
                        let scale_factor = Math.sqrt((parseFloat(state.scale_to_megapixel)||1.0)*1024*1024 / (totW*totH));
                        finalW = Math.floor(totW*scale_factor) - (Math.floor(totW*scale_factor)%8);
                        finalH = Math.floor(totH*scale_factor) - (Math.floor(totH*scale_factor)%8);
                    }
                    els.dims.textContent = `${finalW} x ${finalH} | ${state.mode === "Exact Pixels" ? "Exact Override" : (state.mode === "No Padding" ? "No Padding" : state.padding_style)}`;
                };

                els.canvas.addEventListener("mousedown", (e) => {
                    const state = getState();
                    if (e.button === 2) return; 
                    if (!state.crop_enabled) return;

                    const zoomScale = (app.canvas && app.canvas.ds) ? app.canvas.ds.scale : 1.0;
                    const rect = els.canvas.getBoundingClientRect();
                    const mx = (e.clientX - rect.left) / zoomScale;
                    const my = (e.clientY - rect.top) / zoomScale;

                    let bx = layoutContext.imgX + state.crop_left * layoutContext.imgW;
                    let by = layoutContext.imgY + state.crop_top * layoutContext.imgH;
                    let bw = (state.crop_right - state.crop_left) * layoutContext.imgW;
                    let bh = (state.crop_bottom - state.crop_top) * layoutContext.imgH;
                    
                    const grabThresh = Math.max(12, 12 / zoomScale);

                    if (Math.abs(mx - bx) < grabThresh && Math.abs(my - by) < grabThresh) activeHandle = "tl";
                    else if (Math.abs(mx - (bx + bw)) < grabThresh && Math.abs(my - by) < grabThresh) activeHandle = "tr";
                    else if (Math.abs(mx - bx) < grabThresh && Math.abs(my - (by + bh)) < grabThresh) activeHandle = "bl";
                    else if (Math.abs(mx - (bx + bw)) < grabThresh && Math.abs(my - (by + bh)) < grabThresh) activeHandle = "br";
                    else if (mx > bx && mx < bx + bw && my > by && my < by + bh) activeHandle = "center";
                    else return;

                    isDraggingCrop = true;
                    lastMouseX = mx;
                    lastMouseY = my;
                    e.preventDefault();
                });

                window.addEventListener("mousemove", (e) => {
                    if (!isDraggingCrop) return;
                    const state = getState();
                    const zoomScale = (app.canvas && app.canvas.ds) ? app.canvas.ds.scale : 1.0;
                    const rect = els.canvas.getBoundingClientRect();
                    const mx = (e.clientX - rect.left) / zoomScale;
                    const my = (e.clientY - rect.top) / zoomScale;

                    let deltaX = (mx - lastMouseX) / layoutContext.imgW;
                    let deltaY = (my - lastMouseY) / layoutContext.imgH;

                    let nl = state.crop_left, nt = state.crop_top, nr = state.crop_right, nb = state.crop_bottom;

                    if (activeHandle === "center") {
                        let w = nr - nl; let h = nb - nt;
                        nl = Math.max(0, Math.min(1 - w, nl + deltaX));
                        nt = Math.max(0, Math.min(1 - h, nt + deltaY));
                        nr = nl + w; nb = nt + h;
                    } else if (activeHandle === "tl") {
                        nl = Math.max(0, Math.min(nr - 0.05, nl + deltaX));
                        nt = Math.max(0, Math.min(nb - 0.05, nt + deltaY));
                    } else if (activeHandle === "tr") {
                        nr = Math.max(nl + 0.05, Math.min(1, nr + deltaX));
                        nt = Math.max(0, Math.min(nb - 0.05, nt + deltaY));
                    } else if (activeHandle === "bl") {
                        nl = Math.max(0, Math.min(nr - 0.05, nl + deltaX));
                        nb = Math.max(nt + 0.05, Math.min(1, nb + deltaY));
                    } else if (activeHandle === "br") {
                        nr = Math.max(nl + 0.05, Math.min(1, nr + deltaX));
                        nb = Math.max(nt + 0.05, Math.min(1, nb + deltaY));
                    }

                    lastMouseX = mx; lastMouseY = my;
                    setState({ crop_left: nl, crop_top: nt, crop_right: nr, crop_bottom: nb });
                });

                window.addEventListener("mouseup", () => {
                    if (isDraggingCrop) {
                        isDraggingCrop = false;
                        activeHandle = null;
                    }
                });

                root.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (app.canvas && app.canvas.processContextMenu) {
                        app.canvas.processContextMenu(node, e);
                    }
                });

                const updateUI = () => {
                    const s = getState();
                    els.mode.value=s.mode; els.aspect.value=s.target_aspect; els.align.value=s.aspect_alignment;
                    els.padL.value=s.manual_left; els.padT.value=s.manual_top; els.padR.value=s.manual_right; els.padB.value=s.manual_bottom;
                    els.exactW.value=s.exact_width; els.exactH.value=s.exact_height; els.color.value=s.padding_style;
                    els.scaling.value=s.scaling_mode; els.mp.value=s.scale_to_megapixel; els.maskGrow.value=s.mask_grow;
                    
                    els.aspectSettings.classList.toggle("mps-hidden", s.mode!=="Aspect Ratio");
                    els.manualSettings.classList.toggle("mps-hidden", s.mode!=="Manual Pixels");
                    els.exactSettings.classList.toggle("mps-hidden", s.mode!=="Exact Pixels");
                    els.colorBox.classList.toggle("mps-hidden", s.mode==="No Padding" || s.mode==="Exact Pixels");
                    els.scalingRow.classList.toggle("mps-hidden", s.mode==="Exact Pixels");
                    els.mpBox.classList.toggle("mps-hidden", s.scaling_mode==="No Scaling" || s.mode==="Exact Pixels");
                    els.flipH.style.background = s.flip_h ? "#3b82f6" : "";
                    els.flipV.style.background = s.flip_v ? "#3b82f6" : "";
                    els.invertMask.textContent = s.invert_mask ? "True" : "False";
                    els.invertMask.style.background = s.invert_mask ? "#3b82f6" : "";
                    
                    els.cropEnable.textContent = s.crop_enabled ? "Enabled" : "Disabled";
                    els.cropEnable.style.background = s.crop_enabled ? "#3b82f6" : "";
                    renderCanvas();
                };

                els.cropEnable.addEventListener("click", (e) => { e.stopPropagation(); setState({ crop_enabled: !getState().crop_enabled }); });

                els.mode.addEventListener("click", e => e.stopPropagation());
                els.mode.addEventListener("change", e => setState({mode: e.target.value}));
                els.aspect.addEventListener("click", e => e.stopPropagation());
                els.aspect.addEventListener("change", e => setState({target_aspect: e.target.value}));
                els.align.addEventListener("click", e => e.stopPropagation());
                els.align.addEventListener("change", e => setState({aspect_alignment: e.target.value}));
                els.color.addEventListener("click", e => e.stopPropagation());
                els.color.addEventListener("change", e => setState({padding_style: e.target.value}));
                els.scaling.addEventListener("click", e => e.stopPropagation());
                els.scaling.addEventListener("change", e => setState({scaling_mode: e.target.value}));
                els.mp.addEventListener("click", e => e.stopPropagation());
                els.mp.addEventListener("change", e => setState({scale_to_megapixel: e.target.value}));
                els.padL.addEventListener("click", e => e.stopPropagation());
                els.padL.addEventListener("change", e => setState({manual_left: e.target.value}));
                els.padT.addEventListener("click", e => e.stopPropagation());
                els.padT.addEventListener("change", e => setState({manual_top: e.target.value}));
                els.padR.addEventListener("click", e => e.stopPropagation());
                els.padR.addEventListener("change", e => setState({manual_right: e.target.value}));
                els.padB.addEventListener("click", e => e.stopPropagation());
                els.padB.addEventListener("change", e => setState({manual_bottom: e.target.value}));
                els.exactW.addEventListener("click", e => e.stopPropagation());
                els.exactW.addEventListener("change", e => setState({exact_width: e.target.value}));
                els.exactH.addEventListener("click", e => e.stopPropagation());
                els.exactH.addEventListener("change", e => setState({exact_height: e.target.value}));
                els.maskGrow.addEventListener("click", e => e.stopPropagation());
                els.maskGrow.addEventListener("change", e => setState({mask_grow: e.target.value}));
                els.flipH.addEventListener("click", (e) => { e.stopPropagation(); setState({flip_h: !getState().flip_h}); });
                els.flipV.addEventListener("click", (e) => { e.stopPropagation(); setState({flip_v: !getState().flip_v}); });
                els.invertMask.addEventListener("click", (e) => { e.stopPropagation(); setState({invert_mask: !getState().invert_mask}); });
                els.rotL.addEventListener("click", (e) => { e.stopPropagation(); let r=getState().rotation; setState({rotation:(r-90+360)%360}); });
                els.rotR.addEventListener("click", (e) => { e.stopPropagation(); let r=getState().rotation; setState({rotation:(r+90)%360}); });

                const syncImageSource = () => {
                    if (nativeImageWidget && nativeImageWidget.value) {
                        if (currentImg.src !== `/view?filename=${encodeURIComponent(nativeImageWidget.value)}&type=input`) {
                            currentImg = new Image();
                            currentImg.onload = renderCanvas;
                            currentImg.src = `/view?filename=${encodeURIComponent(nativeImageWidget.value)}&type=input`;
                        }
                    }
                };

                if (nativeImageWidget) {
                    const origCallback = nativeImageWidget.callback;
                    nativeImageWidget.callback = function () {
                        if (origCallback) origCallback.apply(this, arguments);
                        syncImageSource();
                    };
                    syncImageSource();
                }

                const handleUpload = async (file) => {
                    if (!file) return;
                    const form = new FormData(); form.append("image", file);
                    try {
                        const resp = await fetch("/upload/image", { method: "POST", body: form });
                        const data = await resp.json();
                        if (data.name) {
                            if (nativeImageWidget) nativeImageWidget.value = data.name;
                            currentImg = new Image();
                            currentImg.onload = renderCanvas;
                            currentImg.src = `/view?filename=${encodeURIComponent(data.name)}&type=input`;
                        }
                    } catch (err) { console.error("Upload failed", err); }
                };

                els.upload.addEventListener("click", (e) => { e.stopPropagation(); els.fileInput.click(); });
                els.fileInput.addEventListener("change", (e) => handleUpload(e.target.files[0]));

                const handleGlobalPaste = (e) => {
                    const isNodeTargeted = app.canvas && app.canvas.selected_nodes && app.canvas.selected_nodes[node.id];
                    const isContainerFocused = document.activeElement === root || root.contains(document.activeElement);

                    if (isNodeTargeted || isContainerFocused) {
                        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                        for (let i = 0; i < items.length; i++) {
                            if (items[i].type.indexOf("image") === 0) {
                                const file = items[i].getAsFile();
                                handleUpload(file);
                                e.preventDefault();
                                e.stopPropagation(); 
                                break;
                            }
                        }
                    }
                };

                window.removeEventListener("paste", handleGlobalPaste, true);
                window.addEventListener("paste", handleGlobalPaste, true);

                root.addEventListener("click", (e) => {
                    if(e.target === root || e.target.classList.contains("mps-row") || e.target.classList.contains("mps-label")) {
                        root.focus();
                    }
                });

                root.addEventListener("dragover", (e) => {
                    e.preventDefault(); e.stopPropagation();
                    root.classList.add("mps-dragover");
                });
                root.addEventListener("dragenter", (e) => { e.preventDefault(); e.stopPropagation(); });
                root.addEventListener("dragleave", (e) => {
                    e.preventDefault(); e.stopPropagation();
                    root.classList.remove("mps-dragover");
                });
                root.addEventListener("drop", (e) => {
                    e.preventDefault(); e.stopPropagation();
                    root.classList.remove("mps-dragover");
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        handleUpload(e.dataTransfer.files[0]);
                    }
                });

                node.size = [310, 620]; 
                node.addDOMWidget("modern_pad_ui", "custom", root, { getValue: () => null, setValue: () => {}, getMinHeight: () => 620 });
                
                setTimeout(() => { syncImageSource(); updateUI(); }, 250);
                return r;
            };
        }
    }
});