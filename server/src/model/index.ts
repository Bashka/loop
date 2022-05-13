import type { Entity } from "@geckos.io/snapshot-interpolation/lib/types";
import Matter from "matter-js";
import { nanoid } from "nanoid";

export namespace types {
  export interface Body {
    state: Entity;
  }

  export interface World {
    state: Record<string, Entity[]>;
  }
}

declare global {
  namespace Matter {
    export interface Body {
      meta?: { id: string; type: "person" | "coin" };
    }
  }
}

export function signal<T>(listener: (data: T) => unknown = () => {}) {
  return (d: typeof listener | T) =>
    typeof d === "function" ? (listener = d as typeof listener) : listener(d);
}

export class Hash<T extends types.Body> {
  public readonly bodies: Record<string, T> = {};

  public readonly onAdd = signal<T[]>();

  public readonly onDelete = signal<T[]>();

  get size() {
    return Object.keys(this.bodies).length;
  }

  get(id: string) {
    return this.bodies[id];
  }

  add(...values: T[]) {
    values.forEach((value) => (this.bodies[value.state.id] = value));
    this.onAdd(values);
  }

  delete(...values: T[]) {
    values.forEach(({ state: { id } }) => delete this.bodies[id]);
    this.onDelete(values);
  }

  map<V>(cb: (body: T) => V) {
    return Object.values(this.bodies).map(cb);
  }
}

export enum PersonSprite {
  Man,
  Hunter,
}

export enum PersonAnimation {
  Stay,
  MoveUp,
  MoveDown,
  MoveLeft,
  MoveRight,
}

export class Person implements types.Body {
  public readonly id = nanoid(6);

  public readonly body: Matter.Body;

  constructor(
    public speed: number,
    pos: { x: number; y: number },
    public sprite = PersonSprite.Man,
    public animation = PersonAnimation.Stay
  ) {
    const { x, y } = pos;
    this.body = Matter.Bodies.rectangle(x, y, 10, 10);
    this.body.meta = { id: this.id, type: "person" };
  }

  get state() {
    const { x, y } = this.body.position;
    return {
      id: this.id,
      x: Math.floor(x),
      y: Math.floor(y),
      sprite: this.sprite,
      animation: this.animation,
    };
  }
}

export class Coin implements types.Body {
  public readonly id = nanoid(6);

  public readonly body: Matter.Body;

  constructor(pos: { x: number; y: number }) {
    const { x, y } = pos;
    this.body = Matter.Bodies.circle(x, y, 10, {
      isSensor: true,
    });
    this.body.meta = { id: this.id, type: "coin" };
  }

  get state() {
    const { x, y } = this.body.position;
    return {
      id: this.id,
      x: Math.floor(x),
      y: Math.floor(y),
    };
  }
}

export class Wall implements types.Body {
  public readonly id = nanoid(6);

  public readonly body: Matter.Body;

  constructor(
    pos: { x: number; y: number },
    public w: number,
    public h: number
  ) {
    const { x, y } = pos;
    this.body = Matter.Bodies.rectangle(x + w / 2, y + h / 2, w, h, {
      isStatic: true,
    });
  }

  get state() {
    return {
      id: this.id,
      x: this.body.vertices[0].x,
      y: this.body.vertices[0].y,
      w: this.w,
      h: this.h,
    };
  }
}

export interface Options {
  width: number;
  height: number;
  fps: number;
  sprites: {
    [k: number]: {
      url: string;
      animations: {
        [k: number]: {
          speed?: number;
          frames: Array<[number, number, number, number]>;
        };
      };
    };
  };
  map: {
    tileset: {
      tile: {
        width: number;
        height: number;
      };
      image: {
        url: string;
        width: number;
        height: number;
      };
    };
    width: number;
    height: number;
    layers: Array<{
      zIndex: number;
      tiles: number[];
    }>;
  };
}

export class World implements types.World {
  public readonly persons = new Hash<Person>();

  public readonly coins = new Hash<Coin>();

  public readonly walls = new Hash<Wall>();

  public readonly physics = Matter.Engine.create({
    gravity: { x: 0, y: 0 },
  });

  public readonly players = new Map<
    string,
    {
      person: string;
      keyboard: Set<string>;
    }
  >();

  constructor(
    public readonly options: Options,
    public readonly coinsPos: Array<{ x: number; y: number }>,
    wallsPos: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>,
    startHunter: { x: number; y: number }
  ) {
    this.regenerateCoins();
    wallsPos.forEach((zone) =>
      this.createWall(zone.x, zone.y, zone.width, zone.height)
    );
    Matter.Events.on(
      this.physics,
      "collisionStart",
      ({ pairs: [{ bodyA, bodyB }] }) => {
        if (!bodyA.meta || !bodyB.meta) return;
        const metaA = bodyA.meta;
        const metaB = bodyB.meta;
        if (
          (metaA.type === "person" && metaB.type === "coin") ||
          (metaA.type === "coin" && metaB.type === "person")
        ) {
          const person = this.persons.get(
            bodyA.meta.type === "person" ? bodyA.meta.id : bodyB.meta.id
          );
          const coin = this.coins.get(
            bodyA.meta.type === "coin" ? bodyA.meta.id : bodyB.meta.id
          );
          if (!person || !coin || person.sprite === PersonSprite.Hunter) return;

          this.removeCoin(coin);
          if (this.coins.size === 0) {
            this.regenerateCoins();
          }
        } else if (metaA.type === "person" && metaB.type === "person") {
          const personA = this.persons.get(metaA.id);
          const personB = this.persons.get(metaB.id);
          if (!personA || !personB) return;

          const [hunter, man] =
            personA.sprite === PersonSprite.Hunter
              ? [personA, personB]
              : [personB, personA];

          man.sprite = PersonSprite.Hunter;
          Matter.Body.setPosition(man.body, startHunter);

          hunter.sprite = PersonSprite.Man;
        }
      }
    );
  }

  get state() {
    return {
      persons: this.persons.map(({ state }) => state),
      coins: this.coins.map(({ state }) => state),
    };
  }

  createWall(x = 0, y = 0, w = 0, h = 0) {
    const wall = new Wall({ x, y }, w, h);
    this.walls.add(wall);
    Matter.Composite.add(this.physics.world, wall.body);
    return wall;
  }

  removeWall(wall: Wall) {
    this.walls.delete(wall);
    Matter.Composite.remove(this.physics.world, wall.body);
  }

  regenerateCoins() {
    const coins = this.coinsPos.map((pos) => new Coin(pos));
    this.coins.add(...coins);
    Matter.Composite.add(
      this.physics.world,
      coins.map(({ body }) => body)
    );
  }

  removeCoin(coin: Coin) {
    this.coins.delete(coin);
    Matter.Composite.remove(this.physics.world, coin.body);
  }

  updateHuntersSpeed(speed: number) {
    this.persons.map((person) => {
      if (person.sprite !== PersonSprite.Hunter) return;
      person.speed = speed;
    });
  }

  createPerson(x = 0, y = 0, isHunter = 0) {
    const speed = isHunter ? Math.max(1, 11 - this.persons.size) : 10;
    const person = new Person(
      speed,
      { x, y },
      isHunter ? PersonSprite.Hunter : PersonSprite.Man
    );
    this.persons.add(person);
    Matter.Composite.add(this.physics.world, person.body);
    this.updateHuntersSpeed(speed);
    return person;
  }

  removePerson(person: Person) {
    this.persons.delete(person);
    Matter.Composite.remove(this.physics.world, person.body);
    this.updateHuntersSpeed(Math.max(1, 11 - this.persons.size));
  }

  linkPlayer(channelId: string, perons: Person) {
    this.players.set(channelId, {
      person: perons.id,
      keyboard: new Set(),
    });
    return perons;
  }

  unlinkPlayer(channelId: string) {
    this.players.delete(channelId);
    return this;
  }

  key(channelId: string, data: { type: "up" | "down"; key: string }) {
    const keyboard = this.players.get(channelId)?.keyboard;
    if (!keyboard) return;
    data.type === "down" ? keyboard.add(data.key) : keyboard.delete(data.key);
  }

  getPlayerPerson(channelId: string) {
    const player = this.players.get(channelId);
    if (player) return this.persons.get(player.person);
  }

  update(d: number) {
    this.players.forEach(({ person: id, keyboard }) => {
      const person = this.persons.get(id);
      if (!person) return;

      const force = Matter.Vector.create();
      if (keyboard.has("a")) {
        force.x -= 1;
        person.animation = PersonAnimation.MoveLeft;
      }
      if (keyboard.has("d")) {
        force.x += 1;
        person.animation = PersonAnimation.MoveRight;
      }
      if (keyboard.has("w")) {
        force.y -= 1;
        person.animation = PersonAnimation.MoveUp;
      }
      if (keyboard.has("s")) {
        force.y += 1;
        person.animation = PersonAnimation.MoveDown;
      }
      if (keyboard.size === 0) {
        person.animation = PersonAnimation.Stay;
      }
      Matter.Body.setPosition(
        person.body,
        Matter.Vector.add(
          person.body.position,
          Matter.Vector.mult(
            Matter.Vector.normalise(force),
            (d / 100) * person.speed
          )
        )
      );
    });

    Matter.Engine.update(this.physics, d);
  }
}
