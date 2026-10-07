import { FEED_IDS } from "../core/pyth";
import { selectPriceSource, withMockedAssets, type PriceSource } from "../core/price";

// Literal process.env access so Expo inlines the values at bundle time.
const APP_PRICE_SOURCE: PriceSource = selectPriceSource(
  {
    EXPO_PUBLIC_PYTH_API_KEY: process.env.EXPO_PUBLIC_PYTH_API_KEY,
    EXPO_PUBLIC_PRICE_SOURCE: process.env.EXPO_PUBLIC_PRICE_SOURCE,
  },
  (url, init) => fetch(url, init),
  () => Date.now() / 1000,
  // EXPO_PUBLIC_MOCK_ASSETS=SKR → SKR uses demo prices (badged) even with a Pyth key.
  withMockedAssets(FEED_IDS, process.env.EXPO_PUBLIC_MOCK_ASSETS),
);

/** The app's only way to read prices: real Pyth or deterministic demo prices (badge them!). */
export function usePriceSource(): PriceSource {
  return APP_PRICE_SOURCE;
}
