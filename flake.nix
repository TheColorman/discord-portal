{
  description = "Portal is a bot for connecting channels across Discord servers.";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/release-26.05";
    flake-parts = {
      url = "github:hercules-ci/flake-parts";
      inputs.nixpkgs-lib.follows = "nixpkgs";
    };
  };
  outputs =
    inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } (
      {
        self,
        lib,
        ...
      }:
      {
        systems = lib.systems.flakeExposed;

        perSystem =
          {
            config,
            pkgs,
            self',
            ...
          }:
          {
            packages = {
              discord-portal = pkgs.callPackage ./nix/package.nix { };
              default = config.packages.discord-portal;
            };
            devShells.default = pkgs.mkShell {
              inputsFrom = [ self'.packages.default ];
            };
          };

        flake.nixosModules = {
          factbot = import ./nix/module.nix;
          default = self.nixosModules.factbot;
        };
      }
    );
}
