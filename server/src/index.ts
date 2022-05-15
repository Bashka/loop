import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import express from "express";
import tileset from "./map/tileset.json" assert { type: "json" };
import tilemap from "./map/tilemap.json" assert { type: "json" };
import * as Tiled from "./tiled.js";
import { Room } from "./room.js";
import { World, PersonSprite, PersonAnimation } from "./model/index.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
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
const room = new Room(
  new World(
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
  )
);
room.onConnection(({ channel }) => {
  if (!channel.id) return;
  console.log(`${channel.id} connected`);
  const { world } = room;
  world.linkPlayer(
    channel.id,
    world.createPerson(world.state.persons.size > 0 ? startHunter : startVictim)
  );
  channel.on("key", (data: any) => channel.id && world.key(channel.id, data));
});
room.onDisconnect(({ channel }) => {
  if (!channel.id) return;
  console.log(`${channel.id} disconected`);
  const { world } = room;
  const playerPerson = world.getPlayerPerson(channel.id);
  world.unlinkPlayer(channel.id);
  if (playerPerson) world.removePerson(playerPerson);
});
room.server.addServer(server);
room.runner.play();

server.listen(8080, "localhost", () => console.log("listen: 8080"));
