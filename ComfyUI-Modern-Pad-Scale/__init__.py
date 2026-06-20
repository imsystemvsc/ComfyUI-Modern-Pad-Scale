import os
import folder_paths

from .modern_pad_scale import ModernPadAndScale

NODE_CLASS_MAPPINGS = {
    "ModernPadAndScale": ModernPadAndScale
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ModernPadAndScale": "Modern Pad & Scale"
}

WEB_DIRECTORY = "./js"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]