{
  config,
  pkgs,
  lib,
  ...
}: let
  cfg = config.services.discord-portal;

  discord-portalOpts = with lib;
    {name, ...}: {
      options = {
        enable = mkEnableOption "discord-portal instance";

        name = mkOption {
          type = types.str;
          default = name;
          description = ''
            Name is used as a suffix for the service name. By default it takes
            the value you use for `<instance>` in:
            {option}`services.discord-portal.instances.<instances>`
          '';
        };

        package = mkPackageOption pkgs "discord-portal" {};

        tokenFile = mkOption {
          type = types.path;
          description = ''
            Path to the utf-8 encoded file containing the Discord bot token.
          '';
        };
      };
    };
in {
  options.services.discord-portal.instances = with lib;
    mkOption {
      default = {};
      type = types.attrsOf (types.submodule discord-portalOpts);
      description = ''
        Defines multiple discord-portal intances. If you don't require multiple
        instances of discord-portal, you can define just the one.
      '';
      example = ''
        {
        	main = {
        		enable = true;
        		tokenFile = /etc/discord-portal/token;
        	};
        	withSops = {
        		enable = true;
        		tokenFile = config.sops.secrets.discord-portalToken.path;
        	};
        }
      '';
    };

  config = let
    mkInstanceServiceConfig = instance: {
      description = "Portal discord bot, ${instance.name} instance";
      wantedBy = ["multi-user.target"];
      after = ["network.target"];
      environment.TOKEN_FILE = instance.tokenFile;
      serviceConfig = {
        Type = "simple";
        ExecStart = "${instance.package}/bin/discord-portal";
        Restart = "on-failure";
        StateDirectory = "discord-portal-${instance.name}";

        # Basic hardening
        NoNewPrivileges = true;
        PrivateTmp = true;
        PrivateDevies = true;
        DevicePolicy = "closed";
        DynamicUser = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ProtectControlGroups = true;
        ProtectKernelModules = true;
        ProtectKernelTunables = true;
        RestrictAddressFamilies = ["AF_UNIX" "AF_INET" "AF_INET6" "AF_NETLINK"];
        RestrictNameSpaces = true;
        RestrictRealtime = true;
        RestrictSUIDSGID = true;
        LockPersonality = true;
        SystemCallFilter = [
          "~@cpu-emulation"
          "~@debug"
          "~@keyring"
          "~@memlock"
          "~@obsolete"
          "~@privileged"
          "~@setuid"
        ];
      };
    };
    instances = lib.attrValues cfg.instances;
  in {
    nixpkgs.overlays = [
      (import ./overlay.nix)
    ];

    systemd.services = lib.mkMerge (
      map (
        instance:
          lib.mkIf instance.enable {
            "discord-portal-${instance.name}" = mkInstanceServiceConfig instance;
          }
      )
      instances
    );
  };
}
