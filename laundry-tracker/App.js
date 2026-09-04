import React from "react";
import { LogBox } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AppNavigator from "./src/navigation/AppNavigator";

LogBox.ignoreLogs([
  "Network request failed",
  "Using offline order fallback",
  "Intake photo upload",
  "Could not insert order_items",
  "SafeAreaView has been deprecated",
  "Couldn't load garment list",
]);

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}

