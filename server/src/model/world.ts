import Matter from "matter-js";
import * as Tiled from "../tiled";
import {
  Signal,
  Person,
  Coin,
  Wall,
} from "./state.js";

export interface Options {
  width: number;
  height: number;
  fps: number;
  sprites: {
    [k: string]: {
      url: string;
      animations: {
        [k: string]: {
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

export class World {
  public readonly startVictim;

  public readonly startHunter;

  public readonly players = new Map<
    string,
    {
      person: string;
      keyboard: Set<string>;
    }
  >();

  public readonly physics = Matter.Engine.create({
    gravity: { x: 0, y: 0 },
  });

  public readonly persons = new Map<string, Person>();

  public readonly coins = new Map<string, Coin>();

  public readonly walls = new Map<string, Wall>();

  public readonly onPersonDelete = new Signal<Person[]>();

  public readonly onCoinCreate = new Signal<Coin[]>();

  public readonly onCoinDelete = new Signal<Coin[]>();

  constructor(
    public readonly map: Tiled.Loader,
    public readonly options: Options
  ) {
    map.objects.forEach(({ objects }) =>
      objects
        .filter(({ properties }) =>
          properties?.find(
            ({ name, type, value }) =>
              type === "string" && name === "type" && value === "wall"
          )
        )
        .forEach((zone) =>
          this.createWall(zone.x, zone.y, zone.width, zone.height)
        )
    );
    this.regenerateCoins();
    this.startVictim = map.objects[0].objects.find(
      ({ properties }) =>
        properties &&
        properties.some(
          ({ name, type, value }) =>
            type === "string" && name === "type" && value === "startMan"
        )
    ) ?? { x: 0, y: 0 };
    this.startHunter = map.objects[0].objects.find(
      ({ properties }) =>
        properties &&
        properties.some(
          ({ name, type, value }) =>
            type === "string" && name === "type" && value === "startGhost"
        )
    ) ?? { x: 0, y: 0 };

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
          if (!person || !coin || person?.isGhost) return;

          this.removeCoin(coin);
          if (this.coins.size === 0) {
            this.regenerateCoins();
          }
        } else if (metaA.type === "person" && metaB.type === "person") {
          const personA = this.persons.get(metaA.id);
          const personB = this.persons.get(metaB.id);
          if (!personA || !personB) return;

          const [ghost, man] = personA.isGhost
            ? [personA, personB]
            : [personB, personA];

          man.isGhost = 1;
          man.sprite = "ghost";
          Matter.Body.setPosition(man.body, this.startHunter);

          ghost.isGhost = 0;
          ghost.sprite = "man";
        }
      }
    );
  }

  regenerateCoins() {
    this.map.objects.forEach(({ objects }) => {
      const coins = objects
        .filter(({ properties }) =>
          properties?.find(
            ({ name, type, value }) =>
              type === "string" && name === "type" && value === "coin"
          )
        )
        .map(({ x, y }) => {
          const coin = new Coin(x, y);
          this.coins.set(coin.id, coin);
          return coin;
        });
      Matter.Composite.add(
        this.physics.world,
        coins.map(({ body }) => body)
      );
      this.onCoinCreate.emit(coins);
    });
  }

  createWall(x = 0, y = 0, w = 0, h = 0) {
    const wall = new Wall(x, y, w, h);
    this.walls.set(wall.id, wall);
    Matter.Composite.add(this.physics.world, wall.body);
    return wall;
  }

  removeWall({ id, body }: Wall) {
    this.walls.delete(id);
    Matter.Composite.remove(this.physics.world, body);
  }

  updateGhostsSpeed(speed: number) {
    Array.from(this.persons.values()).forEach((person) => {
      if (!person.isGhost) return;
      person.speed = speed;
    });
  }

  createPerson(x = 0, y = 0, isGhost = 0) {
    const speed = isGhost ? Math.max(1, 11 - this.persons.size) : 10;
    const person = new Person(x, y, speed, isGhost);
    this.persons.set(person.id, person);
    Matter.Composite.add(this.physics.world, person.body);
    this.updateGhostsSpeed(speed);
    return person;
  }

  removePerson(person: Person) {
    this.persons.delete(person.id);
    Matter.Composite.remove(this.physics.world, person.body);
    this.updateGhostsSpeed(Math.max(1, 11 - this.persons.size));
    this.onPersonDelete.emit([person]);
  }

  removeCoin(coin: Coin) {
    this.coins.delete(coin.id);
    Matter.Composite.remove(this.physics.world, coin.body);
    this.onCoinDelete.emit([coin]);
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
        person.animation = "moveLeft";
      }
      if (keyboard.has("d")) {
        force.x += 1;
        person.animation = "moveRight";
      }
      if (keyboard.has("w")) {
        force.y -= 1;
        person.animation = "moveUp";
      }
      if (keyboard.has("s")) {
        force.y += 1;
        person.animation = "moveDown";
      }
      if (keyboard.size === 0) {
        person.animation = "stay";
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

  zip() {
    return {
      persons: Array.from(this.persons.values()).map((person) => person.zip()),
      coins: Array.from(this.coins.values()).map((coin) => coin.zip()),
    };
  }
}
