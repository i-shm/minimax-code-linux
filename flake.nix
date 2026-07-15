{
  description = "Unofficial, user-scoped Nix package for MiniMax Agent";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfree = true;
      };
      minimax-agent = pkgs.callPackage ./nix/minimax-agent.nix { };
    in
    {
      packages.${system} = {
        inherit minimax-agent;
        default = minimax-agent;
      };

      apps.${system}.default = {
        type = "app";
        program = "${minimax-agent}/bin/minimax-agent";
        meta.description = "Launch MiniMax Agent";
      };

      checks.${system} = {
        launcher-policy = pkgs.callPackage ./nix/launcher-policy-check.nix {
          inherit minimax-agent;
        };

        electron-version = pkgs.callPackage ./nix/electron-version-check.nix {
          inherit minimax-agent;
        };

        external-browser-environment = pkgs.callPackage ./nix/external-browser-environment-check.nix {
          inherit minimax-agent;
        };

        china-locale = pkgs.callPackage ./nix/china-locale-check.nix {
          inherit minimax-agent;
        };

        china-renderer-login = pkgs.callPackage ./nix/china-renderer-login-check.nix {
          inherit minimax-agent;
        };

        domestic-deep-link-protocol = pkgs.callPackage ./nix/deep-link-protocol-check.nix {
          inherit minimax-agent;
        };

        deep-link-compatibility = pkgs.callPackage ./nix/deep-link-compatibility-check.nix {
          inherit minimax-agent;
        };
      };
    };
}
