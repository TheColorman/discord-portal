{
  pkgs,
  lib,
  ...
}: {
  systemd.services.test = {
    description = "Test service";
    after = ["network.target"];
    requires = ["network.target"];
    serviceConfig = let
      script = pkgs.writeShellApplication {
        name = "test-script";
        text = ''
          echo "Hello, world!"
          pwd
        '';
      };
    in {
      Type = "simple";
      ExecStart = lib.getExe script;
      Restart = "on-failure";
      StateDirectory = "test-dir";
    };
  };
}
