export namespace Config {
  export interface TileSet {
    imagewidth: number;
    imageheight: number;
    tilewidth: number;
    tileheight: number;
    columns: number;
  }

  export interface NamedProperty {
    name: string;
  }

  export interface StringProperty extends NamedProperty{
    type: "string";
    value: string;
  }

  export interface IntProperty extends NamedProperty{
    type: "int";
    value: number;
  }

  export type Property = StringProperty | IntProperty;

  export interface RectObject {
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
    properties?: Property[];
  }

  export type Object = RectObject;

  export interface ObjectGroup {
    type: "objectgroup";
    objects: Object[];
    name: string;
  }

  export interface TileLayer {
    type: "tilelayer";
    data: number[];
    height: number;
    width: number;
    name: string;
    properties?: Property[];
  }

  export type Layer = TileLayer | ObjectGroup;

  export interface TileMap {
    width: number;
    height: number;
    layers: Layer[];
  }
}

export class Loader {
  constructor(
    public readonly tileset: Config.TileSet,
    public readonly tilemap: Config.TileMap
  ) {}

  get width() {
    return this.tilemap.width;
  }

  get height() {
    return this.tilemap.height;
  }

  tileAt(index: number) {
    const pos = index - 1;

    return {
      x: (pos * this.tileset.tilewidth) % this.tileset.imagewidth,
      y:
        Math.floor((pos * this.tileset.tilewidth) / this.tileset.imagewidth) *
        this.tileset.tileheight,
    };
  }

  get tiles() {
    return this.tilemap.layers.filter(
      (layer): layer is Config.TileLayer => layer.type === "tilelayer"
    );
  }

  get objects() {
    return this.tilemap.layers.filter(
      (layer): layer is Config.ObjectGroup => layer.type === "objectgroup"
    );
  }
}
