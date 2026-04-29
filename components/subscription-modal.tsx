/**
 * Subscription & Billing Modal
 * Shows current plan, trial status, plan limits, and upgrade/manage options.
 * Owner-only — accessible from Profile screen.
 */
import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { getApiBaseUrl } from "@/constants/oauth";

interface SubscriptionModalProps {
  visible: boolean;
  onClose: () => void;
  companyId: number;
}

const PLANS = [
  {
    key: "starter",
    name: "Starter",
    price: "$29",
    period: "/mo",
    employees: "15 employees",
    jobs: "10 active jobs",
    features: ["Daily reports & timesheets", "Payroll tracking", "AI assistant (Pivot)", "GPS clock-in/out"],
    priceType: "starter" as const,
  },
  {
    key: "professional",
    name: "Professional",
    price: "$59",
    period: "/mo",
    employees: "Unlimited employees",
    jobs: "Unlimited jobs",
    features: ["Everything in Starter", "Advanced financial dashboards", "All trades unlocked", "Priority support", "Custom PDF reports"],
    priceType: "professional" as const,
    popular: true,
  },
];

export function SubscriptionModal({ visible, onClose, companyId }: SubscriptionModalProps) {
  const colors = useColors();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  // Fetch subscription status
  const { data: subscription, isLoading, refetch } = trpc.company.checkSubscription.useQuery(
    { companyId },
    { enabled: visible && companyId > 0, staleTime: 5000 }
  );

  const handleUpgrade = useCallback(async (priceType: "starter" | "professional") => {
    setLoading(true);
    setSelectedPlan(priceType);
    try {
      const apiBase = getApiBaseUrl();
      const successUrl = `${apiBase}/api/portal/?subscription=success`;
      const cancelUrl = `${apiBase}/api/portal/?subscription=cancelled`;

      const response = await fetch(`${apiBase}/api/stripe/create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, priceType, successUrl, cancelUrl }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create checkout session");
      }

      const { url } = await response.json();
      if (url) {
        // Open Stripe Checkout in browser
        if (Platform.OS === "web") {
          window.open(url, "_blank");
        } else {
          await Linking.openURL(url);
        }
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Could not start checkout. Please try again.");
    } finally {
      setLoading(false);
      setSelectedPlan(null);
    }
  }, [companyId]);

  const handleManageSubscription = useCallback(async () => {
    setLoading(true);
    try {
      const apiBase = getApiBaseUrl();
      const returnUrl = `${apiBase}/api/portal/`;

      const response = await fetch(`${apiBase}/api/stripe/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, returnUrl }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to open billing portal");
      }

      const { url } = await response.json();
      if (url) {
        if (Platform.OS === "web") {
          window.open(url, "_blank");
        } else {
          await Linking.openURL(url);
        }
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Could not open billing portal. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const getStatusColor = () => {
    if (!subscription) return colors.muted;
    switch (subscription.status) {
      case "active": return colors.success;
      case "trialing": return "#D4AF37";
      case "past_due": return colors.warning;
      case "cancelled":
      case "expired": return colors.error;
      default: return colors.muted;
    }
  };

  const getStatusLabel = () => {
    if (!subscription) return "Loading...";
    switch (subscription.status) {
      case "active": return "Active";
      case "trialing": return `Trial (${subscription.trialDaysLeft} days left)`;
      case "past_due": return "Past Due";
      case "cancelled": return "Cancelled";
      case "expired": return "Expired";
      default: return subscription.status;
    }
  };

  const getPlanLabel = () => {
    if (!subscription) return "—";
    switch (subscription.plan) {
      case "trial": return "Free Trial";
      case "starter": return "Starter";
      case "professional": return "Professional";
      case "enterprise": return "Enterprise";
      default: return subscription.plan;
    }
  };

  const isActivePaid = subscription?.status === "active" && subscription?.plan !== "trial";

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" }}>
          {/* Header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View>
              <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>Subscription & Billing</Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>Manage your BuildTrack Pro plan</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <MaterialIcons name="close" size={24} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            {isLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: colors.muted, marginTop: 12 }}>Loading subscription...</Text>
              </View>
            ) : (
              <>
                {/* Current Plan Card */}
                <View style={[styles.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: getStatusColor() + "20", alignItems: "center", justifyContent: "center" }}>
                        <MaterialIcons
                          name={isActivePaid ? "verified" : subscription?.status === "trialing" ? "hourglass-top" : "warning"}
                          size={22}
                          color={getStatusColor()}
                        />
                      </View>
                      <View>
                        <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>{getPlanLabel()}</Text>
                        <Text style={{ fontSize: 13, color: getStatusColor(), fontWeight: "600" }}>{getStatusLabel()}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Plan Limits */}
                  <View style={{ marginTop: 16, gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <MaterialIcons name="people" size={16} color={colors.muted} />
                      <Text style={{ fontSize: 14, color: colors.foreground }}>
                        Max Employees: <Text style={{ fontWeight: "700" }}>{subscription?.maxEmployees === 999 ? "Unlimited" : subscription?.maxEmployees || "—"}</Text>
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <MaterialIcons name="work" size={16} color={colors.muted} />
                      <Text style={{ fontSize: 14, color: colors.foreground }}>
                        Max Active Jobs: <Text style={{ fontWeight: "700" }}>{subscription?.maxJobs === 999 ? "Unlimited" : subscription?.maxJobs || "—"}</Text>
                      </Text>
                    </View>
                  </View>

                  {/* Trial Warning */}
                  {subscription?.status === "trialing" && subscription.trialDaysLeft <= 7 && (
                    <View style={{ marginTop: 14, backgroundColor: "#D4AF37" + "15", borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <MaterialIcons name="info" size={18} color="#D4AF37" />
                      <Text style={{ fontSize: 13, color: "#D4AF37", fontWeight: "600", flex: 1 }}>
                        {subscription.trialDaysLeft === 0
                          ? "Your trial expires today! Upgrade to keep access."
                          : `Your trial expires in ${subscription.trialDaysLeft} day${subscription.trialDaysLeft > 1 ? "s" : ""}. Upgrade now to avoid interruption.`}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Manage Subscription Button (for active paid subscribers) */}
                {isActivePaid && (
                  <TouchableOpacity
                    style={[styles.manageBtn, { borderColor: colors.primary }]}
                    onPress={() => {
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      handleManageSubscription();
                    }}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <MaterialIcons name="credit-card" size={18} color={colors.primary} />
                        <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 15 }}>Manage Subscription</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {/* Upgrade Plans (show for trial, cancelled, or expired users) */}
                {(!isActivePaid) && (
                  <>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginTop: 24, marginBottom: 14 }}>
                      {subscription?.status === "trialing" ? "Choose a Plan" : "Reactivate Your Subscription"}
                    </Text>

                    {PLANS.map((plan) => {
                      const isCurrentPlan = subscription?.plan === plan.key && subscription?.status === "active";
                      return (
                        <View
                          key={plan.key}
                          style={[
                            styles.upgradeCard,
                            {
                              backgroundColor: colors.surface,
                              borderColor: plan.popular ? "#D4AF37" : colors.border,
                              borderWidth: plan.popular ? 2 : 1,
                            },
                          ]}
                        >
                          {plan.popular && (
                            <View style={{ position: "absolute", top: -10, right: 16, backgroundColor: "#D4AF37", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 }}>
                              <Text style={{ fontSize: 10, fontWeight: "800", color: "#000" }}>MOST POPULAR</Text>
                            </View>
                          )}
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <View>
                              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>{plan.name}</Text>
                              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>{plan.employees} • {plan.jobs}</Text>
                            </View>
                            <View style={{ alignItems: "flex-end" }}>
                              <Text style={{ fontSize: 28, fontWeight: "800", color: colors.foreground }}>{plan.price}</Text>
                              <Text style={{ fontSize: 12, color: colors.muted }}>{plan.period}</Text>
                            </View>
                          </View>

                          {/* Features */}
                          <View style={{ marginTop: 14, gap: 6 }}>
                            {plan.features.map((feature, idx) => (
                              <View key={idx} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                <MaterialIcons name="check-circle" size={16} color={colors.success} />
                                <Text style={{ fontSize: 13, color: colors.foreground }}>{feature}</Text>
                              </View>
                            ))}
                          </View>

                          {/* Upgrade Button */}
                          <TouchableOpacity
                            style={[
                              styles.upgradeBtn,
                              {
                                backgroundColor: plan.popular ? "#D4AF37" : colors.primary,
                                opacity: loading && selectedPlan === plan.priceType ? 0.6 : 1,
                              },
                            ]}
                            onPress={() => {
                              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              handleUpgrade(plan.priceType);
                            }}
                            disabled={loading || isCurrentPlan}
                          >
                            {loading && selectedPlan === plan.priceType ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={{ color: plan.popular ? "#000" : "#fff", fontWeight: "800", fontSize: 15 }}>
                                {isCurrentPlan ? "Current Plan" : "Upgrade Now"}
                              </Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      );
                    })}

                    {/* Enterprise note */}
                    <View style={{ marginTop: 16, backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <MaterialIcons name="business" size={18} color={colors.foreground} />
                        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>Enterprise</Text>
                      </View>
                      <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>
                        Need custom limits, dedicated support, or multi-company management? Contact us for enterprise pricing.
                      </Text>
                      <TouchableOpacity
                        style={{ marginTop: 10 }}
                        onPress={() => Linking.openURL("https://buildtrack-dnjxcthz.manus.space/api/web/support")}
                      >
                        <Text style={{ fontSize: 14, color: colors.primary, fontWeight: "600" }}>Contact Sales →</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {/* Refresh button */}
                <TouchableOpacity
                  style={{ marginTop: 20, alignItems: "center", paddingVertical: 10 }}
                  onPress={() => refetch()}
                >
                  <Text style={{ fontSize: 13, color: colors.muted }}>Tap to refresh status</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  planCard: {
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
  },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  upgradeCard: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    position: "relative",
  },
  upgradeBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
});
