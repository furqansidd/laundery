import React from "react";
import { Text, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import IntakeScreen from "../screens/IntakeScreen";
import QuickPressScreen from "../screens/QuickPressScreen";
import SortingScreen from "../screens/SortingScreen";
import OrdersScreen from "../screens/OrdersScreen";
import SettingsScreen from "../screens/SettingsScreen";
import { colors, shadow } from "../theme";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 68,
          paddingBottom: 10,
          paddingTop: 8,
          ...shadow.lg,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontWeight: "800",
          fontSize: 11,
          marginTop: 4,
        },
      }}
    >
      <Tab.Screen
        name="IntakeTab"
        component={IntakeScreen}
        options={{
          tabBarLabel: "Intake",
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                width: 36,
                height: 28,
                borderRadius: 14,
                backgroundColor: focused ? colors.primaryLight : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: focused ? 20 : 17 }}>🧺</Text>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="QuickPressTab"
        component={QuickPressScreen}
        options={{
          tabBarLabel: "Quick Press",
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                width: 36,
                height: 28,
                borderRadius: 14,
                backgroundColor: focused ? colors.primaryLight : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: focused ? 20 : 17 }}>⚡</Text>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="SortingTab"
        component={SortingScreen}
        options={{
          tabBarLabel: "Verify",
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                width: 36,
                height: 28,
                borderRadius: 14,
                backgroundColor: focused ? colors.primaryLight : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: focused ? 20 : 17 }}>🔍</Text>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="OrdersTab"
        component={OrdersScreen}
        options={{
          tabBarLabel: "Orders",
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                width: 36,
                height: 28,
                borderRadius: 14,
                backgroundColor: focused ? colors.primaryLight : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: focused ? 20 : 17 }}>📋</Text>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: "Settings",
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                width: 36,
                height: 28,
                borderRadius: 14,
                backgroundColor: focused ? colors.primaryLight : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: focused ? 20 : 17 }}>⚙️</Text>
            </View>
          ),
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

