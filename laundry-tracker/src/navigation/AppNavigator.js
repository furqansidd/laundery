import React from "react";
import { Text } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import IntakeScreen from "../screens/IntakeScreen";
import SortingScreen from "../screens/SortingScreen";
import OrdersScreen from "../screens/OrdersScreen";
import { colors } from "../theme";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontWeight: "700",
          fontSize: 12,
        },
      }}
    >
      <Tab.Screen
        name="IntakeTab"
        component={IntakeScreen}
        options={{
          tabBarLabel: "Intake",
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🧺</Text>,
        }}
      />
      <Tab.Screen
        name="SortingTab"
        component={SortingScreen}
        options={{
          tabBarLabel: "Verify",
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🔍</Text>,
        }}
      />
      <Tab.Screen
        name="OrdersTab"
        component={OrdersScreen}
        options={{
          tabBarLabel: "Orders",
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>📋</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={MainTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
