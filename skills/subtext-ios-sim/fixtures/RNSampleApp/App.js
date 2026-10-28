import React, { createContext, useContext, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { logSessionUrl } from './fullstory';

const Session = createContext(null);
const Tabs = createBottomTabNavigator();
const ProductStack = createNativeStackNavigator();

const products = Array.from({ length: 200 }, (_, i) => {
  const id = i + 1;
  const cents = String((id * 37) % 100).padStart(2, '0');
  return { id, name: `Product ${id}`, price: `$${5 + (id % 95)}.${cents}` };
});

console.log('Subtext RN Sample launched');
logSessionUrl();

export default function App() {
  const [email, setEmail] = useState(null);
  return (
    <SafeAreaProvider>
      <Session.Provider value={{ email, setEmail }}>
        {email ? <MainTabs /> : <LoginScreen />}
      </Session.Provider>
    </SafeAreaProvider>
  );
}

function LoginScreen() {
  const { setEmail } = useContext(Session);
  const [email, setEmailText] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const signIn = () => {
    if (!email.includes('@') || !password) {
      setError('Enter an email and password');
      console.error('sign-in rejected: missing email or password');
      return;
    }
    console.log(`signed in as ${email}`);
    setEmail(email);
  };

  return (
    <View style={[styles.screen, styles.centered]}>
      <Label style={styles.title} testID="login-title">Subtext RN Sample</Label>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmailText}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        testID="login-email"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        testID="login-password"
      />
      {error && <Label style={styles.error} testID="login-error">{error}</Label>}
      <Pressable style={styles.button} onPress={signIn} accessibilityRole="button" testID="login-submit">
        <Text style={styles.buttonText}>Sign In</Text>
      </Pressable>
    </View>
  );
}

function MainTabs() {
  return (
    <NavigationContainer>
      <Tabs.Navigator>
        <Tabs.Screen name="ProductsTab" component={ProductsStack}
          options={{ title: 'Products', headerShown: false, tabBarButtonTestID: 'tab-products' }} />
        <Tabs.Screen name="Network" component={NetworkScreen} options={{ tabBarButtonTestID: 'tab-network' }} />
        <Tabs.Screen name="Account" component={AccountScreen} options={{ tabBarButtonTestID: 'tab-account' }} />
      </Tabs.Navigator>
    </NavigationContainer>
  );
}

function ProductsStack() {
  return (
    <ProductStack.Navigator>
      <ProductStack.Screen name="Products" component={ProductList} />
      <ProductStack.Screen name="ProductDetail" component={ProductDetail}
        options={({ route }) => ({ title: route.params.product.name })} />
    </ProductStack.Navigator>
  );
}

// Rows and the Add to Cart button deliberately have no accessibilityRole, like
// most RN apps: they show up as `other`, so their selectors match on identifier.
function ProductList({ navigation }) {
  return (
    <FlatList
      data={products}
      keyExtractor={(p) => String(p.id)}
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => navigation.navigate('ProductDetail', { product: item })}
          testID={`product-row-${item.id}`}>
          <Text>{item.name}</Text>
          <Text style={styles.secondary}>{item.price}</Text>
        </Pressable>
      )}
    />
  );
}

function ProductDetail({ route }) {
  const { product } = route.params;
  const [inCart, setInCart] = useState(false);
  const add = () => {
    setInCart(true);
    console.log(`added ${product.name} to cart`);
  };
  return (
    <View style={[styles.screen, styles.centered]}>
      <Label style={styles.title} testID="product-detail-name">{product.name}</Label>
      <Label style={styles.price} testID="product-detail-price">{product.price}</Label>
      <Pressable style={[styles.button, inCart && styles.disabled]} onPress={add} disabled={inCart}
        testID="product-detail-add">
        <Text style={styles.buttonText}>{inCart ? 'Added' : 'Add to Cart'}</Text>
      </Pressable>
    </View>
  );
}

// With the New Architecture, a <Text>'s testID never reaches the accessibility
// tree (its text is exposed through separate elements); an accessible View carries both.
function Label({ testID, style, children }) {
  return (
    <View accessible testID={testID}>
      <Text style={style}>{children}</Text>
    </View>
  );
}

let requestCount = 0;

function NetworkScreen() {
  const [status, setStatus] = useState('Idle');
  const send = async () => {
    requestCount += 1;
    const path = `subtext-sim/order-${requestCount}`;
    setStatus('Sending…');
    console.log(`POST /anything/${path}`);
    try {
      const res = await fetch(`https://httpbin.org/anything/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: requestCount, items: ['Product 1', 'Product 2'] }),
      });
      setStatus(`HTTP ${res.status}`);
    } catch (e) {
      setStatus(`failed: ${e.message}`);
    }
    console.log(`POST /anything/${path} done`);
  };
  return (
    <View style={[styles.screen, styles.centered]}>
      <Pressable style={styles.button} onPress={send} accessibilityRole="button" testID="network-send">
        <Text style={styles.buttonText}>Send Request</Text>
      </Pressable>
      <Label testID="network-status">{status}</Label>
    </View>
  );
}

function AccountScreen() {
  const { email, setEmail } = useContext(Session);
  return (
    <View style={[styles.screen, styles.centered]}>
      <Label testID="account-email">{email}</Label>
      <Pressable onPress={() => { console.log('signed out'); setEmail(null); }} accessibilityRole="button"
        testID="account-sign-out">
        <Text style={styles.link}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white', padding: 24, gap: 16 },
  centered: { justifyContent: 'center', alignItems: 'stretch' },
  title: { fontSize: 30, fontWeight: 'bold', textAlign: 'center' },
  price: { fontSize: 22, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 17 },
  error: { color: 'red' },
  button: { backgroundColor: '#007aff', borderRadius: 10, padding: 12, alignItems: 'center' },
  disabled: { opacity: 0.4 },
  buttonText: { color: 'white', fontSize: 17, fontWeight: '600' },
  link: { color: '#007aff', fontSize: 17, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: 'white',
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  secondary: { color: '#888' },
});
