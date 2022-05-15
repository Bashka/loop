import Matter from "matter-js";
import { nanoid } from "nanoid";
import { types, Hash } from "../room.js";
import schema from "./schema.js";

declare global {
  namespace Matter {
    export interface Body {
      meta?: { id: string; type: "person" | "coin" };
    }
  }
}

export type Pos = { x: number; y: number };

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

export class Person {
  public readonly id = nanoid(6);

  public readonly body: Matter.Body;

  constructor(
    public speed: number,
    { x, y }: Pos,
    public sprite = PersonSprite.Man,
    public animation = PersonAnimation.Stay
  ) {
    this.body = Matter.Bodies.rectangle(x, y, 10, 10);
    this.body.meta = { id: this.id, type: "person" };
  }

  get state() {
    return {
      id: this.id,
      x: Math.floor(this.body.position.x),
      y: Math.floor(this.body.position.y),
      sprite: this.sprite,
      animation: this.animation,
    };
  }
}

export class Coin {
  public readonly id = nanoid(6);

  public readonly body: Matter.Body;

  constructor({ x, y }: Pos) {
    this.body = Matter.Bodies.circle(x, y, 10, {
      isSensor: true,
    });
    this.body.meta = { id: this.id, type: "coin" };
  }

  get state() {
    return {
      id: this.id,
      x: Math.floor(this.body.position.x),
      y: Math.floor(this.body.position.y),
    };
  }
}

export class Wall {
  public readonly id = nanoid(6);

  public readonly body: Matter.Body;

  constructor({ x, y }: Pos, public w: number, public h: number) {
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
  fps: number;
  width: number;
  height: number;
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

export class World implements types.World<Options> {
  public readonly state = {
    persons: new Hash<Person>(),
    coins: new Hash<Coin>(),
  };

  public readonly schema = schema;

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
    public readonly coinsPos: Pos[],
    wallsPos: Array<
      Pos & {
        width: number;
        height: number;
      }
    >,
    startHunter: Pos
  ) {
    this.regenerateCoins();
    wallsPos.forEach((zone) =>
      Matter.Composite.add(
        this.physics.world,
        new Wall(zone, zone.width, zone.height).body
      )
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
          const person = this.state.persons.get(
            bodyA.meta.type === "person" ? bodyA.meta.id : bodyB.meta.id
          );
          const coin = this.state.coins.get(
            bodyA.meta.type === "coin" ? bodyA.meta.id : bodyB.meta.id
          );
          if (!person || !coin || person.sprite === PersonSprite.Hunter) return;

          this.removeCoin(coin);
          if (this.state.coins.size === 0) {
            this.regenerateCoins();
          }
        } else if (metaA.type === "person" && metaB.type === "person") {
          const personA = this.state.persons.get(metaA.id);
          const personB = this.state.persons.get(metaB.id);
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

  regenerateCoins() {
    Matter.Composite.add(
      this.physics.world,
      this.state.coins
        .add(...this.coinsPos.map((pos) => new Coin(pos)))
        .map(({ body }) => body)
    );
  }

  removeCoin(coin: Coin) {
    this.state.coins.delete(coin);
    Matter.Composite.remove(this.physics.world, coin.body);
  }

  updateHuntersSpeed(speed: number) {
    this.state.persons.bodies.forEach(
      (person) =>
        person.sprite === PersonSprite.Hunter && (person.speed = speed)
    );
  }

  createPerson(pos: Pos) {
    const isHunter = this.state.persons.size > 0;
    const speed = isHunter ? Math.max(1, 11 - this.state.persons.size) : 10;
    const person = new Person(
      speed,
      pos,
      isHunter ? PersonSprite.Hunter : PersonSprite.Man
    );
    this.state.persons.add(person);
    Matter.Composite.add(this.physics.world, person.body);
    this.updateHuntersSpeed(speed);
    return person;
  }

  removePerson(person: Person) {
    this.state.persons.delete(person);
    Matter.Composite.remove(this.physics.world, person.body);
    this.updateHuntersSpeed(Math.max(1, 11 - this.state.persons.size));
  }

  linkPlayer(channelId: string, { id }: Person) {
    this.players.set(channelId, {
      person: id,
      keyboard: new Set(),
    });
    return this;
  }

  unlinkPlayer(channelId: string) {
    this.players.delete(channelId);
    return this;
  }

  getPlayerPerson(channelId: string) {
    const player = this.players.get(channelId);
    if (player) return this.state.persons.get(player.person);
    return null;
  }

  key(channelId: string, data: { type: "up" | "down"; key: string }) {
    const keyboard = this.players.get(channelId)?.keyboard;
    if (!keyboard) return;
    data.type === "down" ? keyboard.add(data.key) : keyboard.delete(data.key);
  }

  update(d: number) {
    this.players.forEach(({ person: id, keyboard }) => {
      const person = this.state.persons.get(id);
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
