import { http, createConfig } from "wagmi";
import { localhost } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const customLocalhost = {
  ...localhost,
  id: 31_337,
};

export const config = createConfig({
  chains: [customLocalhost],
  connectors: [injected()],
  transports: {
    [customLocalhost.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
