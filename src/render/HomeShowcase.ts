import { START_X, VEHICLES } from "../constants";
import { VehiclePhysics } from "../physics/VehiclePhysics";
import { getWorldSeed } from "../physics/terrain";
import type { RenderContext, VehicleConfig, ViewState } from "../types";

/** The menu presents a parked rig on an open ridge, away from the launch
 * barrier. Its pose is separate from the live car and uses the same ground
 * fitting as the solver, so starting a run never changes the real spawn. */
export class HomeShowcase {
  private readonly machine = new VehiclePhysics(VEHICLES.rally);
  private readonly view: ViewState = { x: 0, y: 0, scale: 1 };
  private context: RenderContext | null = null;
  private poseKey = "";

  get car() { return this.machine.car; }

  compose(rc: RenderContext, config: VehicleConfig): RenderContext {
    const key = `${config.id}:${getWorldSeed()}`;
    if (key !== this.poseKey) {
      this.machine.setVehicle(config);
      this.machine.teleportTo(START_X + 45);
      this.machine.car.y += 0.32;
      for (const wheel of this.machine.car.wheelWorld) wheel.y += 0.32;
      this.poseKey = key;
    }
    this.view.scale = rc.view.scale;
    this.view.x = this.car.x - rc.width / this.view.scale * 0.18;
    this.view.y = this.car.y - rc.height / this.view.scale * 0.15;
    if (!this.context) this.context = { ...rc, view: this.view };
    else {
      Object.assign(this.context, rc);
      this.context.view = this.view;
    }
    return this.context;
  }
}
