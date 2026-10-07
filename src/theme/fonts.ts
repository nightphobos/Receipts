import { useFonts } from "expo-font";
import { PixelifySans_500Medium, PixelifySans_700Bold } from "@expo-google-fonts/pixelify-sans";
import { DotGothic16_400Regular } from "@expo-google-fonts/dotgothic16";
import { VT323_400Regular } from "@expo-google-fonts/vt323";

/** Loads the three Night Register fonts; true once ready (or failed — then system fonts are used). */
export function useThemeFonts(): boolean {
  const [loaded, error] = useFonts({
    PixelifySans_500Medium,
    PixelifySans_700Bold,
    DotGothic16_400Regular,
    VT323_400Regular,
  });
  return loaded || error != null;
}
