import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logPaymentNavigation } from '@/lib/paymentNavigation';

type Props = {
  children: React.ReactNode;
  screenName: string;
  onRetry?: () => void;
};

type State = {
  hasError: boolean;
  message: string;
};

/**
 * Catches render errors on post-payment screens so users never see a blank white view.
 */
export class PaymentNavigationBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Something went wrong',
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    logPaymentNavigation('render_boundary_error', {
      screen: this.props.screenName,
      error: error instanceof Error ? error.message : String(error),
      componentStack: info.componentStack,
    });
    console.error('[PaymentNavigationBoundary]', this.props.screenName, error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: '' });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
          <View style={styles.center}>
            <Text style={styles.title}>Couldn&apos;t load this screen</Text>
            <Text style={styles.sub}>{this.state.message}</Text>
            {this.props.onRetry ? (
              <Pressable style={styles.btn} onPress={this.handleRetry}>
                <Text style={styles.btnText}>Try again</Text>
              </Pressable>
            ) : null}
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export function PostPaymentLoadingShell({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#16A34A" />
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  center: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  sub: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  btn: {
    marginTop: 20,
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
