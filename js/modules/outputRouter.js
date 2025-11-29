import { Module } from '../core/engine.js';

export class OutputRouterModule extends Module {
  constructor(engine, id) {
    super(engine, id, 'Output Router');
  }

  start() {
    const engine = this.engine;
    if (!engine.audioCtx || !engine.bus1Mod || !engine.bus2Mod) return;
    if (this.inputs.length > 0) return;
    this.inputs.push({
      id: 'bus1LevelCV',
      kind: 'cv',
      param: engine.bus1Mod.gain,
      label: 'Output Ch Level 1'
    });
    this.inputs.push({
      id: 'bus2LevelCV',
      kind: 'cv',
      param: engine.bus2Mod.gain,
      label: 'Output Ch Level 2'
    });
  }
}
