{
  description = "Portal is a bot for connecting channels across Discord servers.";
  inputs = {
    nixpkgs.url = "nixpkgs";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };
  outputs = inputs:
    inputs.flake-parts.lib.mkFlake {inherit inputs;} ({
      self,
      lib,
      ...
    }: {
      systems = lib.systems.flakeExposed;

      perSystem = {
        config,
        pkgs,
        ...
      }: {
        packages = {
          discord-portal = pkgs.callPackage ./nix/package.nix {};
          default = config.packages.discord-portal;
        };
      };

      flake.nixosModules = {
        factbot = import ./nix/module.nix;
        default = self.nixosModules.factbot;
      };
    });
}
