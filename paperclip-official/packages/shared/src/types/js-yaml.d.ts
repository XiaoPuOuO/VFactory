declare module "js-yaml" {
  // Minimal typings used by this repo.
  // We intentionally keep these declarations narrow to avoid coupling to js-yaml internals.
  export const JSON_SCHEMA: unknown;

  type LoadOptions = {
    // js-yaml accepts `schema` objects; we only need it to typecheck call sites.
    schema?: unknown;
  };

  const yaml: {
    load(input: string): unknown;
    load(input: string, options: LoadOptions): unknown;
  };

  export default yaml;
}

