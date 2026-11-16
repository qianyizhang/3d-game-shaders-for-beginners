interface Window {
  DCC_CATALOG: DCC.CatalogData;
  DCCCatalog(data: DCC.CatalogData): DCC.Catalog;
  DCCViewer(
    canvas: HTMLCanvasElement,
    scenes: DCC.CatalogData["scenes"],
    nodes: DCC.CatalogData["nodes"],
    status: HTMLElement,
  ): DCC.Viewer;
  DCCThumbnails(
    scenes: DCC.CatalogData["scenes"],
    nodes: DCC.CatalogData["nodes"],
  ): DCC.Thumbnails;
  DCCPlayback(getViewer: () => DCC.Viewer | undefined): DCC.Playback;
  DCC_GEOMETRY(slug: string, encoded: string): void;
}

declare namespace DCC {
  interface Elements {
    main: HTMLElementTagNameMap["main"];
    "route-status": HTMLElementTagNameMap["p"];
    browse: HTMLElementTagNameMap["section"];
    "browse-title": HTMLElementTagNameMap["h2"];
    query: HTMLElementTagNameMap["input"];
    kind: HTMLElementTagNameMap["select"];
    tag: HTMLElementTagNameMap["select"];
    "reset-filters": HTMLElementTagNameMap["button"];
    count: HTMLElementTagNameMap["p"];
    results: HTMLElementTagNameMap["ul"];
    empty: HTMLElementTagNameMap["div"];
    "clear-query": HTMLElementTagNameMap["button"];
    "all-kinds": HTMLElementTagNameMap["button"];
    detail: HTMLElementTagNameMap["section"];
    "back-results": HTMLElementTagNameMap["a"];
    "result-position": HTMLElementTagNameMap["span"];
    previous: HTMLElementTagNameMap["a"];
    next: HTMLElementTagNameMap["a"];
    "asset-kind": HTMLElementTagNameMap["p"];
    "asset-title": HTMLElementTagNameMap["h2"];
    "asset-summary": HTMLElementTagNameMap["p"];
    preview: HTMLElementTagNameMap["div"];
    model: HTMLElementTagNameMap["canvas"];
    "viewer-status": HTMLElementTagNameMap["p"];
    "viewer-controls": HTMLElementTagNameMap["div"];
    "turn-left": HTMLElementTagNameMap["button"];
    "turn-right": HTMLElementTagNameMap["button"];
    "zoom-in": HTMLElementTagNameMap["button"];
    "zoom-out": HTMLElementTagNameMap["button"];
    "reset-view": HTMLElementTagNameMap["button"];
    uv: HTMLElementTagNameMap["input"];
    "motion-controls": HTMLElementTagNameMap["section"];
    "motion-clip": HTMLElementTagNameMap["select"];
    "motion-play": HTMLElementTagNameMap["button"];
    "motion-rest": HTMLElementTagNameMap["button"];
    "motion-description": HTMLElementTagNameMap["p"];
    "motion-time": HTMLElementTagNameMap["input"];
    "motion-position": HTMLElementTagNameMap["output"];
    "rig-inspector": HTMLElementTagNameMap["details"];
    "motion-joint": HTMLElementTagNameMap["select"];
    "joint-angle": HTMLElementTagNameMap["input"];
    "joint-value": HTMLElementTagNameMap["output"];
    "joint-help": HTMLElementTagNameMap["p"];
    "retry-preview": HTMLElementTagNameMap["button"];
    "viewer-help": HTMLElementTagNameMap["p"];
    texture: HTMLElementTagNameMap["figure"];
    material: HTMLElementTagNameMap["section"];
    "material-title": HTMLElementTagNameMap["h3"];
    bindings: HTMLElementTagNameMap["ul"];
    rights: HTMLElementTagNameMap["p"];
    connections: HTMLElementTagNameMap["div"];
    "source-details": HTMLElementTagNameMap["details"];
    facts: HTMLElementTagNameMap["div"];
  }
}
interface Window {
  DCCElement<K extends keyof DCC.Elements>(id: K): DCC.Elements[K];
}

declare namespace DCC {
  interface Thumbnails {
    observe(host: HTMLElement, entry: Asset): void;
    reset(): void;
    pause(value: boolean): void;
    dispose(): void;
  }
}
