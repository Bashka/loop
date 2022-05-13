import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import express from "express";
import geckos from "@geckos.io/server";
import { SnapshotInterpolation } from "@geckos.io/snapshot-interpolation";
import tileset from "./map/tileset.json" assert { type: "json" };
import tilemap from "./map/tilemap.json" assert { type: "json" };
import * as Tiled from "./tiled.js";
import serializer from "./model/schema.js";
import { World, PersonSprite, PersonAnimation } from "./model/index.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = geckos();
const SI = new SnapshotInterpolation();
const map = new Tiled.Loader(tileset as any, tilemap as any);
const startHunter = map.objects[0].objects.find(
  ({ properties }) =>
    properties &&
    properties.some(
      ({ name, type, value }) =>
        type === "string" && name === "type" && value === "startGhost"
    )
) ?? { x: 0, y: 0 };
const startVictim = map.objects[0].objects.find(
  ({ properties }) =>
    properties &&
    properties.some(
      ({ name, type, value }) =>
        type === "string" && name === "type" && value === "startMan"
    )
) ?? { x: 0, y: 0 };
const world = new World(
  {
    width: 800,
    height: 600,
    fps: 50,
    sprites: {
      [PersonSprite.Man]: {
        url: "/images/man.png",
        animations: {
          [PersonAnimation.Stay]: {
            speed: 0,
            frames: [[32, 64, 32, 32]],
          },
          [PersonAnimation.MoveUp]: {
            speed: 0.1,
            frames: [
              [0, 0, 32, 32],
              [32, 0, 32, 32],
              [64, 0, 32, 32],
            ],
          },
          [PersonAnimation.MoveRight]: {
            speed: 0.1,
            frames: [
              [0, 32, 32, 32],
              [32, 32, 32, 32],
              [64, 32, 32, 32],
            ],
          },
          [PersonAnimation.MoveDown]: {
            speed: 0.1,
            frames: [
              [0, 64, 32, 32],
              [32, 64, 32, 32],
              [64, 64, 32, 32],
            ],
          },
          [PersonAnimation.MoveLeft]: {
            speed: 0.1,
            frames: [
              [0, 96, 32, 32],
              [32, 96, 32, 32],
              [64, 96, 32, 32],
            ],
          },
        },
      },
      [PersonSprite.Hunter]: {
        url: "/images/ghost.png",
        animations: {
          [PersonAnimation.Stay]: {
            speed: 0,
            frames: [[32, 64, 32, 32]],
          },
          [PersonAnimation.MoveUp]: {
            speed: 0.1,
            frames: [
              [0, 0, 32, 32],
              [32, 0, 32, 32],
              [64, 0, 32, 32],
            ],
          },
          [PersonAnimation.MoveRight]: {
            speed: 0.1,
            frames: [
              [0, 32, 32, 32],
              [32, 32, 32, 32],
              [64, 32, 32, 32],
            ],
          },
          [PersonAnimation.MoveDown]: {
            speed: 0.1,
            frames: [
              [0, 64, 32, 32],
              [32, 64, 32, 32],
              [64, 64, 32, 32],
            ],
          },
          [PersonAnimation.MoveLeft]: {
            speed: 0.1,
            frames: [
              [0, 96, 32, 32],
              [32, 96, 32, 32],
              [64, 96, 32, 32],
            ],
          },
        },
      },
    },
    map: {
      tileset: {
        tile: {
          width: map.tileset.tilewidth,
          height: map.tileset.tileheight,
        },
        image: {
          url: "/images/tileset.png",
          width: map.tileset.imagewidth,
          height: map.tileset.imageheight,
        },
      },
      width: map.width,
      height: map.height,
      layers: map.tiles.map(({ data, properties }) => ({
        tiles: data,
        zIndex:
          properties?.find(
            (property): property is Tiled.Config.IntProperty =>
              property.name === "zIndex" && property.type === "int"
          )?.value ?? 0,
      })),
    },
  },
  map.objects.reduce(
    (res, { objects }) => [
      ...res,
      ...objects.filter(({ properties }) =>
        properties?.find(
          ({ name, type, value }) =>
            type === "string" && name === "type" && value === "coin"
        )
      ),
    ],
    [] as Array<{ x: number; y: number }>
  ),
  map.objects.reduce(
    (res, { objects }) => [
      ...res,
      ...objects.filter(({ properties }) =>
        properties?.find(
          ({ name, type, value }) =>
            type === "string" && name === "type" && value === "wall"
        )
      ),
    ],
    [] as Array<{ x: number; y: number; width: number; height: number }>
  ),
  startHunter
);
world.persons.onDelete((persons) =>
  io.emit(
    "patch",
    { persons: { del: persons.map(({ id }) => id) } },
    { reliable: true }
  )
);
world.coins.onAdd((coins) =>
  io.emit(
    "patch",
    { coins: { add: coins.map((coin) => coin.state) } },
    { reliable: true }
  )
);
world.coins.onDelete((coins) =>
  io.emit(
    "patch",
    { coins: { del: coins.map(({ id }) => id) } },
    { reliable: true }
  )
);

app.use(
  "/dist",
  express.static(path.resolve(dirname, "../../client/assets/dist"))
);
app.use(
  "/images",
  express.static(path.resolve(dirname, "../../client/assets/images"))
);
app.get("/", (_, res) =>
  res.sendFile(path.resolve(dirname, "../../client/assets/index.html"))
);

io.addServer(server);
io.onConnection((channel) => {
  const { id: channelId } = channel;
  if (channelId === undefined) return;

  console.log(`${channelId} connected`);
  const startPos = world.persons.size > 0 ? startHunter : startVictim;
  const playerPerson = world.linkPlayer(
    channelId,
    world.createPerson(startPos.x, startPos.y, Number(world.persons.size > 0))
  );

  channel.onDisconnect(() => {
    console.log(`${channelId} disconected`);

    world.unlinkPlayer(channelId).removePerson(playerPerson);
  });

  channel.emit(
    "init",
    {
      options: world.options,
      patch: Object.entries(world.state).reduce(
        (result, [type, add]) => ({ ...result, [type]: { add } }),
        {}
      ),
    },
    { reliable: true }
  );
  channel.broadcast.emit(
    "patch",
    {
      persons: { add: [playerPerson.state] },
    },
    {
      reliable: true,
    }
  );
  channel.on("key", (data: any) => world.key(channelId, data));
});

setInterval(() => {
  world.update(world.options.fps);

  const state = world.state;
  const struct = serializer.schema.struct as { state: object };
  const snap = SI.snapshot.create(
    Object.keys(struct.state).reduce(
      (res, name) => ({
        ...res,
        [name]: state[name as keyof typeof state],
      }),
      {}
    )
  );
  io.raw.emit(serializer.toBuffer(snap));
}, world.options.fps);

server.listen(8080, "localhost", () => console.log("listen: 8080"));
