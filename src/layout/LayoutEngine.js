/**
 * Coordinates layout computation and animated transitions.
 */
export class LayoutEngine {
  constructor(nodeRenderer, edgeRenderer, graphData) {
    this.nodeRenderer = nodeRenderer;
    this.edgeRenderer = edgeRenderer;
    this.graphData = graphData;
    this._animating = false;
    this._animCallback = null;
  }

  /**
   * Apply layout immediately (no animation).
   */
  applyImmediate(layout) {
    const { channelPositions, blockPositions } = layout;

    // Set channel positions
    for (let i = 0; i < this.graphData.channels.length; i++) {
      const ch = this.graphData.channels[i];
      const pos = channelPositions[ch.id];
      if (pos) {
        this.nodeRenderer.setChannelPosition(i, pos.x, pos.y, pos.z);
      }
    }

    // Set block positions
    for (let i = 0; i < this.graphData.blocks.length; i++) {
      const pos = blockPositions[i];
      if (pos) {
        this.nodeRenderer.setBlockPosition(i, pos.x, pos.y, pos.z);
      }
    }

    this.nodeRenderer.commitPositions();
    this.edgeRenderer.updatePositions();
  }

  /**
   * Animate to new layout with ease-out cubic.
   */
  animateTo(layout, duration = 600, onComplete) {
    if (this._animating && this._animCallback) {
      cancelAnimationFrame(this._animCallback);
    }

    const { channelPositions, blockPositions } = layout;
    const nr = this.nodeRenderer;

    // Capture start positions
    const startBlock = [];
    for (let i = 0; i < this.graphData.blocks.length; i++) {
      startBlock.push(nr.getBlockPosition(i));
    }
    const startChannel = [];
    for (let i = 0; i < this.graphData.channels.length; i++) {
      startChannel.push(nr.getChannelPosition(i));
    }

    const startTime = performance.now();
    this._animating = true;

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const step = () => {
      let t = (performance.now() - startTime) / duration;
      if (t > 1) t = 1;
      const ease = easeOutCubic(t);

      // Lerp block positions
      for (let i = 0; i < this.graphData.blocks.length; i++) {
        const s = startBlock[i];
        const e = blockPositions[i];
        if (s && e) {
          nr.setBlockPosition(
            i,
            s.x + (e.x - s.x) * ease,
            s.y + (e.y - s.y) * ease,
            s.z + (e.z - s.z) * ease
          );
        }
      }

      // Lerp channel positions
      for (let i = 0; i < this.graphData.channels.length; i++) {
        const ch = this.graphData.channels[i];
        const s = startChannel[i];
        const e = channelPositions[ch.id];
        if (s && e) {
          nr.setChannelPosition(
            i,
            s.x + (e.x - s.x) * ease,
            s.y + (e.y - s.y) * ease,
            s.z + (e.z - s.z) * ease
          );
        }
      }

      nr.commitPositions();
      this.edgeRenderer.updatePositions();

      if (t < 1) {
        this._animCallback = requestAnimationFrame(step);
      } else {
        this._animating = false;
        if (onComplete) onComplete();
      }
    };

    this._animCallback = requestAnimationFrame(step);
  }

  get isAnimating() {
    return this._animating;
  }
}
