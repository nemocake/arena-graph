import * as THREE from 'three';
import { TOOLTIP_OFFSET } from '../constants.js';

/**
 * Manages the hover tooltip DOM element.
 * Projects 3D positions to screen coords.
 */
export class TooltipManager {
  constructor(camera, container) {
    this.camera = camera;
    this.container = container;

    this.el = document.getElementById('hover-tooltip');
    this.thumbEl = document.getElementById('tooltip-thumb');
    this.imgEl = document.getElementById('tooltip-img');
    this.typeEl = document.getElementById('tooltip-type');
    this.titleEl = document.getElementById('tooltip-title');
    this.textEl = document.getElementById('tooltip-text');

    this._visible = false;
    this._vec3 = new THREE.Vector3();
  }

  show(blockData, worldPos) {
    // Type badge
    this.typeEl.textContent = blockData.class || 'Block';

    // Title
    this.titleEl.textContent = blockData.label || 'Untitled';

    // Thumbnail
    if (blockData.thumb && blockData.class === 'Image') {
      this.imgEl.src = blockData.thumb;
      this.thumbEl.classList.remove('hidden');
    } else {
      this.thumbEl.classList.add('hidden');
    }

    // Description snippet
    const desc = blockData.description || blockData.content || '';
    if (desc) {
      this.textEl.textContent = desc.substring(0, 150);
      this.textEl.classList.remove('hidden');
    } else {
      this.textEl.classList.add('hidden');
    }

    this.el.classList.remove('hidden');
    this._visible = true;

    this._updateScreenPos(worldPos);
  }

  updatePosition(worldPos) {
    if (!this._visible) return;
    this._updateScreenPos(worldPos);
  }

  _updateScreenPos(worldPos) {
    this._vec3.set(worldPos.x, worldPos.y, worldPos.z);
    this._vec3.project(this.camera);

    const rect = this.container.getBoundingClientRect();
    const x = (this._vec3.x * 0.5 + 0.5) * rect.width;
    const y = (-this._vec3.y * 0.5 + 0.5) * rect.height;

    this.el.style.transform = `translate(${x + TOOLTIP_OFFSET}px, ${y - 20}px)`;
    this.el.style.opacity = '1';
  }

  hide() {
    this.el.style.opacity = '0';
    this._visible = false;
    setTimeout(() => {
      if (!this._visible) this.el.classList.add('hidden');
    }, 150);
  }
}
