import { nanoid } from "nanoid";
import Matter from "matter-js";

export class Signal<T> {
  constructor(public readonly listeners = new Set<(data: T) => unknown>()) {}

  emit(data: T) {
    this.listeners.forEach((listen) => listen(data));
  }

  listen(listener: (data: T) => unknown) {
    this.listeners.add(listener);
  }
}

declare global {
  namespace Matter {
    export interface Body {
      meta?: { id: string; type: "person" | "coin" };
    }
  }
}

export abstract class Body {
  constructor(public readonly id: string = nanoid()) {}

  zip() {
    return {
      id: this.id,
    };
  }
}

export class Person extends Body {
  public readonly body;

  public sprite: string;

  public animation: string;

  constructor(x: number, y: number, public speed = 10, public isGhost = 0) {
    super();
    this.body = Matter.Bodies.rectangle(x, y, 10, 10);
    this.body.meta = { id: this.id, type: "person" };
    this.sprite = isGhost ? "ghost" : "man";
    this.animation = "stay";
  }

  zip() {
    const { x, y } = this.body.position;
    return {
      ...super.zip(),
      isGhost: this.isGhost,
      sprite: this.sprite,
      animation: this.animation,
      x,
      y,
    };
  }
}

export class Coin extends Body {
  public readonly body;

  constructor(x: number, y: number) {
    super();
    this.body = Matter.Bodies.circle(x, y, 10, {
      isSensor: true,
    });
    this.body.meta = { id: this.id, type: "coin" };
  }

  zip() {
    const { x, y } = this.body.position;
    return {
      ...super.zip(),
      x,
      y,
    };
  }
}

export class Wall extends Body {
  static CollisionCategory = 0x001;

  public readonly body;

  constructor(x: number, y: number, public w: number, public h: number) {
    super();
    this.body = Matter.Bodies.rectangle(x + w / 2, y + h / 2, w, h, {
      isStatic: true,
    });
  }

  zip() {
    return {
      ...super.zip(),
      x: this.body.vertices[0].x,
      y: this.body.vertices[0].y,
      w: this.w,
      h: this.h,
    };
  }
}
