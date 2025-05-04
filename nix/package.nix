{
  buildNpmPackage,
  node-gyp,
  nodejs_20,
}:
buildNpmPackage {
  pname = "discord-portal";
  version = "0.4.0";

  nodejs = nodejs_20;

  src = ./..;

  npmDepsHash = "sha256-/WqudsoyRexNMVh5sa+rAFOS0bpWm9PWjwUXOY8W1ZM=";

  nativeBuildInputs = [
    node-gyp
  ];
}
