import torch
import numpy as np
import torch.nn.functional as F
from PIL import Image, ImageOps
import folder_paths
import os
import json
import hashlib

DEFAULT_STATE = {
    "mode": "Aspect Ratio",
    "rotation": 0,
    "flip_h": False,
    "flip_v": False,
    "invert_mask": False,
    "mask_grow": 0,
    "target_aspect": "16:9",
    "aspect_alignment": "Center",
    "padding_style": "Solid Black",
    "scaling_mode": "Megapixel Scaling",
    "scale_to_megapixel": 1.0,
    "manual_left": 0, "manual_top": 0, "manual_right": 0, "manual_bottom": 0,
    "exact_width": 1024, "exact_height": 1024,
    "crop_enabled": False,
    "crop_left": 0.0, "crop_top": 0.0, "crop_right": 1.0, "crop_bottom": 1.0
}

class ModernPadAndScale:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        input_dir = folder_paths.get_input_directory()
        files = [os.path.relpath(os.path.join(dp, f), input_dir).replace("\\", "/") 
                 for dp, dn, filenames in os.walk(input_dir) for f in filenames]
        
        return {
            "required": {
                "image": (sorted(files), ),
                "ModernState": ("STRING", {"default": json.dumps(DEFAULT_STATE)}),
            }
        }

    @classmethod
    def VALIDATE_INPUTS(s, image, ModernState, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(s, image, ModernState="{}"):
        m = hashlib.sha256()
        try:
            image_path = folder_paths.get_annotated_filepath(image)
            if os.path.exists(image_path):
                m.update(str(os.path.getmtime(image_path)).encode("utf-8"))
        except:
            pass
        m.update(ModernState.encode("utf-8"))
        return m.hexdigest()

    RETURN_TYPES = ("IMAGE", "MASK", "INT", "INT")
    RETURN_NAMES = ("IMAGE", "MASK", "WIDTH", "HEIGHT")
    FUNCTION = "process_image"
    CATEGORY = "Imsystem Suite"

    def process_image(self, image, ModernState="{}"):
        try:
            state = {**DEFAULT_STATE, **json.loads(ModernState)}
        except:
            state = DEFAULT_STATE

        def safe_int(val, default=0):
            try: return int(val)
            except (ValueError, TypeError): return default
        def safe_float(val, default=1.0):
            try: return float(val)
            except (ValueError, TypeError): return default

        image_path = folder_paths.get_annotated_filepath(image)
        img = Image.open(image_path)
        img = ImageOps.exif_transpose(img) 

        # Step 0: Interactive Crop Execution
        if state.get("crop_enabled", False):
            orig_w, orig_h = img.size
            cl = max(0, min(orig_w - 1, int(safe_float(state.get("crop_left", 0.0)) * orig_w)))
            ct = max(0, min(orig_h - 1, int(safe_float(state.get("crop_top", 0.0)) * orig_h)))
            cr = max(cl + 1, min(orig_w, int(safe_float(state.get("crop_right", 1.0)) * orig_w)))
            cb = max(ct + 1, min(orig_h, int(safe_float(state.get("crop_bottom", 1.0)) * orig_h)))
            img = img.crop((cl, ct, cr, cb))
        
        mode = state.get("mode", "Aspect Ratio")
        rotation = safe_int(state.get("rotation", 0))
        flip_h = state.get("flip_h", False)
        flip_v = state.get("flip_v", False)
        invert_mask = state.get("invert_mask", False)
        mask_grow = safe_int(state.get("mask_grow", 0))
        target_aspect = state.get("target_aspect", "1:1")
        aspect_alignment = state.get("aspect_alignment", "Center")
        padding_style = state.get("padding_style", "Solid Black")
        scaling_mode = state.get("scaling_mode", "Megapixel Scaling")
        manual_left = safe_int(state.get("manual_left", 0))
        manual_top = safe_int(state.get("manual_top", 0))
        manual_right = safe_int(state.get("manual_right", 0))
        manual_bottom = safe_int(state.get("manual_bottom", 0))
        exact_width = max(8, safe_int(state.get("exact_width", 1024)))
        exact_height = max(8, safe_int(state.get("exact_height", 1024)))
        scale_to_megapixel = safe_float(state.get("scale_to_megapixel", 1.0))

        if 'A' in img.getbands():
            alpha = img.getchannel('A')
            base_mask = ImageOps.invert(alpha)
        else:
            base_mask = Image.new("L", (img.width, img.height), 0)

        img = img.convert("RGB")
        
        if flip_h:
            img = ImageOps.mirror(img)
            base_mask = ImageOps.mirror(base_mask)
        if flip_v:
            img = ImageOps.flip(img)
            base_mask = ImageOps.flip(base_mask)
        if rotation == 90:
            img = img.rotate(270, expand=True)
            base_mask = base_mask.rotate(270, expand=True)
        elif rotation == 180:
            img = img.rotate(180, expand=True)
            base_mask = base_mask.rotate(180, expand=True)
        elif rotation == 270:
            img = img.rotate(90, expand=True)
            base_mask = base_mask.rotate(90, expand=True)

        image_np = np.array(img).astype(np.float32) / 255.0
        image_tensor = torch.from_numpy(image_np).unsqueeze(0)
        
        _, original_height, original_width, _ = image_tensor.shape
        pad_l, pad_t, pad_r, pad_b = 0, 0, 0, 0

        if mode == "No Padding" or mode == "Exact Pixels":
            pad_l, pad_t, pad_r, pad_b = 0, 0, 0, 0
        elif mode == "Manual Pixels":
            pad_l, pad_t, pad_r, pad_b = manual_left, manual_top, manual_right, manual_bottom
        else: 
            ratios = {"1:1": 1.0, "16:9": 16/9, "9:16": 9/16, "4:3": 4/3, "3:4": 3/4, "21:9": 21/9}
            target_ratio = ratios.get(target_aspect, 1.0)
            current_ratio = original_width / original_height
            if current_ratio > target_ratio:
                new_height = int(original_width / target_ratio)
                total_pad = new_height - original_height
                if aspect_alignment == "Top": pad_b = total_pad
                elif aspect_alignment == "Bottom": pad_t = total_pad
                else: pad_t = total_pad // 2; pad_b = total_pad - pad_t
            else:
                new_width = int(original_height * target_ratio)
                total_pad = new_width - original_width
                if aspect_alignment == "Left": pad_r = total_pad
                elif aspect_alignment == "Right": pad_l = total_pad
                else: pad_l = total_pad // 2; pad_r = total_pad - pad_l

        img_tensor = image_tensor.permute(0, 3, 1, 2)
        
        if padding_style == "Solid Green":
            new_h, new_w = original_height + pad_t + pad_b, original_width + pad_l + pad_r
            padded_tensor = torch.zeros((img_tensor.shape[0], img_tensor.shape[1], new_h, new_w), dtype=img_tensor.dtype, device=img_tensor.device)
            padded_tensor[:, 1, :, :] = 1.0 
            padded_tensor[:, :, pad_t:pad_t+original_height, pad_l:pad_l+original_width] = img_tensor
        elif padding_style == "Latent Noise":
            new_h, new_w = original_height + pad_t + pad_b, original_width + pad_l + pad_r
            padded_tensor = torch.randn((img_tensor.shape[0], img_tensor.shape[1], new_h, new_w), dtype=img_tensor.dtype, device=img_tensor.device)
            padded_tensor = (padded_tensor * 0.5 + 0.5).clamp(0.0, 1.0)
            padded_tensor[:, :, pad_t:pad_t+original_height, pad_l:pad_l+original_width] = img_tensor
        else: 
            padded_tensor = F.pad(img_tensor, (pad_l, pad_r, pad_t, pad_b), mode='constant', value=0.0)
        
        padded_tensor = padded_tensor.permute(0, 2, 3, 1)
        new_height, new_width = padded_tensor.shape[1], padded_tensor.shape[2]
        
        mask = Image.new("L", (new_width, new_height), 255) 
        mask.paste(base_mask, (pad_l, pad_t)) 

        if mode == "Exact Pixels":
            final_w, final_h = exact_width, exact_height
            final_img = Image.fromarray((padded_tensor[0].cpu().numpy()*255).astype(np.uint8)).resize((final_w, final_h), Image.BICUBIC)
            final_mask = mask.resize((final_w, final_h), Image.NEAREST)
        elif scaling_mode == "No Scaling":
            final_w, final_h = new_width, new_height
            final_img = Image.fromarray((padded_tensor[0].cpu().numpy()*255).astype(np.uint8))
            final_mask = mask
        else:
            scale_factor = ((scale_to_megapixel * 1024 * 1024) / (new_width * new_height)) ** 0.5
            final_w = int(new_width * scale_factor) - (int(new_width * scale_factor) % 8)
            final_h = int(new_height * scale_factor) - (int(new_height * scale_factor) % 8)
            final_img = Image.fromarray((padded_tensor[0].cpu().numpy()*255).astype(np.uint8)).resize((max(8, final_w), max(8, final_h)), Image.BICUBIC)
            final_mask = mask.resize((max(8, final_w), max(8, final_h)), Image.NEAREST)

        out_image = torch.from_numpy(np.array(final_img).astype(np.float32) / 255.0).unsqueeze(0)
        out_mask = torch.from_numpy(np.array(final_mask).astype(np.float32) / 255.0).unsqueeze(0)

        if invert_mask: 
            out_mask = 1.0 - out_mask
            
        if mask_grow != 0:
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            out_mask = out_mask.to(device).unsqueeze(1) 
            kernel = abs(mask_grow) * 2 + 1
            if mask_grow > 0: 
                out_mask = 1.0 - F.max_pool2d(1.0 - out_mask, kernel_size=kernel, stride=1, padding=abs(mask_grow))
            else: 
                out_mask = F.max_pool2d(out_mask, kernel_size=kernel, stride=1, padding=abs(mask_grow))
            out_mask = out_mask.squeeze(1).cpu()

        return (out_image, out_mask, final_w, final_h)