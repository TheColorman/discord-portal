{
  description = "Portal is a bot for connecting channels across Discord servers.";
  inputs = {
    nixpkgs.url = "nixpkgs";
    flake-utils.url = "github:numtide/flake-utils";
  };
  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {inherit system;};
    in {
      packages = {
        discord-portal = pkgs.callPackage ./nix/package.nix {};
        default = self.packages.${system}.discord-portal;
      };
      modules = {
        factbot = import ./nix/module.nix;
        default = self.modules.${system}.factbot;
      };
    });
}
