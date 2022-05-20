import geckos from "@geckos.io/client";
import Room from "./view";

const channel = geckos({ port: 8080 });
channel.onConnect(async (error) => {
  if (error) throw new Error("Connection failed");

  channel.on("init", async ({ options, patch }: any) =>
    new Room(channel, options).onCreated((stage) =>
      stage instanceof Error ? console.error(stage) : stage.patch(patch)
    )
  );
});
