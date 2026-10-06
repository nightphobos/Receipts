import { useCluster } from "./cluster-data-access";
import { RadioButton, Text } from "react-native-paper";
import { ClusterPickerRadioButtonGroupRow } from "./cluster-ui";

// Cluster is set at build time (EXPO_PUBLIC_CLUSTER / EXPO_PUBLIC_RPC_URL); shown read-only.
export default function ClusterPickerFeature() {
  const { selectedCluster, clusters } = useCluster();

  return (
    <>
      <Text variant="headlineMedium">Cluster:</Text>
      <RadioButton.Group onValueChange={() => {}} value={selectedCluster.name}>
        {clusters.map((cluster) => (
          <ClusterPickerRadioButtonGroupRow key={cluster.name} cluster={cluster} />
        ))}
      </RadioButton.Group>
    </>
  );
}
