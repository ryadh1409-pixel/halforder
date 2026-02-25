import AsyncStorage from "@react-native-async-storage/async-storage";
import { addDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import { useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { auth, db } from "../../services/firebase";

const ANON_ID_KEY = "@join_anon_id";

async function getOrCreateAnonId(): Promise<string> {
  let id = await AsyncStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = "anon_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    await AsyncStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

export default function CreateScreen() {
  const [maxPeople, setMaxPeople] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [sharingPrice, setSharingPrice] = useState("");
  const [loading, setLoading] = useState(false);

  const total = Number(totalPrice) || 0;
  const share = Number(sharingPrice) || 0;
  const participantsCount = share > 0 && total >= share ? Math.floor(total / share) : 0;
  const pricePerPerson = share > 0 ? share : 0;
  const [foodType, setFoodType] = useState("pizza");
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantLocation, setRestaurantLocation] = useState("");
  const [orderTime, setOrderTime] = useState("Now");

  const handleCreate = async () => {
    const num = Number(maxPeople);
    if (Number.isNaN(num) || num < 1) {
      Alert.alert("Error", "Enter a valid max people");
      return;
    }
    const price = Number(totalPrice);
    const share = Number(sharingPrice);
    if (Number.isNaN(price) || price < 0 || Number.isNaN(share) || share <= 0) {
      Alert.alert("Error", "Enter valid total price and sharing price");
      return;
    }
    if (price < share) {
      Alert.alert("Error", "Total price must be at least the sharing price");
      return;
    }
    const partCount = Math.floor(price / share);

    try {
      setLoading(true);
      const uid = auth.currentUser?.uid ?? "";
      const anonId = await getOrCreateAnonId();
      const now = new Date();
      const offsetMinutes: Record<string, number> = { "Now": 0, "15 min": 15, "30 min": 30, "1 hour": 60 };
      const mins = offsetMinutes[orderTime] ?? 0;
      const orderAt = new Date(now.getTime() + mins * 60 * 1000);

      await addDoc(collection(db, "orders"), {
        maxPeople: num,
        totalPrice: price,
        sharingPrice: Math.round(share * 100) / 100,
        participantsCount: partCount,
        pricePerPerson: Math.round(share * 100) / 100,
        foodType,
        restaurantName: restaurantName.trim() || "Not specified",
        restaurantLocation: restaurantLocation.trim() || "",
        orderTime,
        orderAt: Timestamp.fromDate(orderAt),
        joinedCount: uid ? 1 : 0,
        participants: uid ? [anonId] : [],
        participantUids: uid ? [uid] : [],
        status: "open",
        createdAt: serverTimestamp(),
      });
      Keyboard.dismiss();
      Alert.alert("Order created", "Order created");
      setMaxPeople("");
      setTotalPrice("");
      setSharingPrice("");
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to create order");
    } finally {
      setLoading(false);
    }
  };

  const isNative = Platform.OS === "ios" || Platform.OS === "android";

  const content = (
    <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
          <Text style={{ fontSize: 22, fontWeight: "600", marginBottom: 16 }}>
            Create Order
          </Text>

          <TextInput
            placeholder="Max people (e.g. 3)"
            value={maxPeople}
            onChangeText={setMaxPeople}
            keyboardType="numeric"
            style={{
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
              color: "#fff",
            }}
            placeholderTextColor="#aaa"
          />

          <TextInput
            placeholder="Total price ($)"
            value={totalPrice}
            onChangeText={setTotalPrice}
            keyboardType="numeric"
            style={{
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
              color: "#fff",
            }}
            placeholderTextColor="#aaa"
          />

          <TextInput
            placeholder="Sharing price ($)"
            value={sharingPrice}
            onChangeText={setSharingPrice}
            keyboardType="numeric"
            style={{
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
              color: "#fff",
            }}
            placeholderTextColor="#aaa"
          />

          {pricePerPerson > 0 && participantsCount > 0 ? (
            <Text style={{ fontSize: 14, color: "#22c55e", marginBottom: 16 }}>
              ${pricePerPerson.toFixed(2)} per person ({participantsCount} people)
            </Text>
          ) : null}

          <Text style={{ fontSize: 16, fontWeight: "500", marginBottom: 8 }}>
            Food Type
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => setFoodType("pizza")}
              style={{
                backgroundColor: foodType === "pizza" ? "#2563eb" : "#e2e8f0",
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: foodType === "pizza" ? "white" : "#1f2937", fontWeight: "600" }}>
                pizza
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setFoodType("noodles")}
              style={{
                backgroundColor: foodType === "noodles" ? "#2563eb" : "#e2e8f0",
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: foodType === "noodles" ? "white" : "#1f2937", fontWeight: "600" }}>
                noodles
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            placeholder="Restaurant name"
            value={restaurantName}
            onChangeText={setRestaurantName}
            style={{
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
              color: "#fff",
            }}
            placeholderTextColor="#aaa"
          />

          <TextInput
            placeholder="Restaurant location"
            value={restaurantLocation}
            onChangeText={setRestaurantLocation}
            style={{
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
              color: "#fff",
            }}
            placeholderTextColor="#aaa"
          />

          <Text style={{ fontSize: 16, fontWeight: "500", marginBottom: 8 }}>
            Order in
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {["Now", "15 min", "30 min", "1 hour"].map((opt) => (
              <TouchableOpacity
                key={opt}
                onPress={() => setOrderTime(opt)}
                style={{
                  backgroundColor: orderTime === opt ? "#2563eb" : "#e2e8f0",
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: orderTime === opt ? "white" : "#1f2937", fontWeight: "600", fontSize: 14 }}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={handleCreate}
            style={{
              backgroundColor: "#2563eb",
              padding: 14,
              borderRadius: 10,
              alignItems: "center",
              opacity: loading ? 0.7 : 1,
            }}
            disabled={loading}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>
              {loading ? "Creating..." : "Create Order"}
            </Text>
          </TouchableOpacity>
    </View>
  );

  const inner = isNative ? (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      {content}
    </TouchableWithoutFeedback>
  ) : (
    content
  );

  return isNative ? (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {inner}
    </KeyboardAvoidingView>
  ) : (
    <View style={{ flex: 1 }}>{inner}</View>
  );
}
