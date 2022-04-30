import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import express from "express";
import geckos from "@geckos.io/server";
import { SnapshotInterpolation } from "@geckos.io/snapshot-interpolation";
import tileset from "./map/tileset.json" assert { type: "json" };
import tilemap from "./map/tilemap.json" assert { type: "json" };
import * as Tiled from "./tiled.js";
import { World } from "./model/world.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = geckos();
const SI = new SnapshotInterpolation();
const map = new Tiled.Loader(tileset as any, tilemap as any);
const world = new World(map, {
  width: 800,
  height: 600,
  fps: 50,
  sprites: {
    man: {
      url: "/images/man.png",
      animations: {
        stay: {
          speed: 0,
          frames: [[32, 64, 32, 32]],
        },
        moveUp: {
          speed: 0.1,
          frames: [
            [0, 0, 32, 32],
            [32, 0, 32, 32],
            [64, 0, 32, 32],
          ],
        },
        moveRight: {
          speed: 0.1,
          frames: [
            [0, 32, 32, 32],
            [32, 32, 32, 32],
            [64, 32, 32, 32],
          ],
        },
        moveDown: {
          speed: 0.1,
          frames: [
            [0, 64, 32, 32],
            [32, 64, 32, 32],
            [64, 64, 32, 32],
          ],
        },
        moveLeft: {
          speed: 0.1,
          frames: [
            [0, 96, 32, 32],
            [32, 96, 32, 32],
            [64, 96, 32, 32],
          ],
        },
      },
    },
    ghost: {
      url: "/images/ghost.png",
      animations: {
        stay: {
          speed: 0,
          frames: [[32, 64, 32, 32]],
        },
        moveUp: {
          speed: 0.1,
          frames: [
            [0, 0, 32, 32],
            [32, 0, 32, 32],
            [64, 0, 32, 32],
          ],
        },
        moveRight: {
          speed: 0.1,
          frames: [
            [0, 32, 32, 32],
            [32, 32, 32, 32],
            [64, 32, 32, 32],
          ],
        },
        moveDown: {
          speed: 0.1,
          frames: [
            [0, 64, 32, 32],
            [32, 64, 32, 32],
            [64, 64, 32, 32],
          ],
        },
        moveLeft: {
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
});
world.onPersonDelete.listen((persons) =>
  io.emit(
    "delete",
    { persons: persons.map(({ id }) => id) },
    {
      reliable: true,
    }
  )
);
world.onCoinCreate.listen((coins) =>
  io.emit(
    "create",
    { coins: coins.map((coin) => coin.zip()) },
    {
      reliable: true,
    }
  )
);
world.onCoinDelete.listen((coins) =>
  io.emit(
    "delete",
    { coins: coins.map(({ id }) => id) },
    {
      reliable: true,
    }
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
  const startPos =
    world.persons.size > 0 ? world.startHunter : world.startVictim;
  const playerPerson = world.linkPlayer(
    channelId,
    world.createPerson(startPos.x, startPos.y, Number(world.persons.size > 0))
  );

  channel.onDisconnect(() => {
    console.log(`${channelId} disconected`);

    world.unlinkPlayer(channelId);
    world.removePerson(playerPerson);
  });

  channel.emit(
    "init",
    { options: world.options, state: world.zip() },
    {
      reliable: true,
    }
  );
  channel.broadcast.emit(
    "create",
    {
      persons: [playerPerson.zip()],
    },
    {
      reliable: true,
    }
  );
  channel.on("down", (key) =>
    world.players.get(channelId)?.keyboard.add(key as string)
  );
  channel.on("up", (key) =>
    world.players.get(channelId)?.keyboard.delete(key as string)
  );
});

setInterval(() => {
  world.update(world.options.fps);

  io.emit("update", SI.snapshot.create(world.zip()));
}, world.options.fps);

server.listen(8080, "localhost", () => console.log("listen: 8080"));
