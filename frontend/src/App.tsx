import { useEffect, useState } from "react";
import "./App.css";

const API = "http://localhost:8081";

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  imageUrl?: string;
  available?: boolean;
}

interface User {
  id?: number;
  name: string;
  email: string;
  role?: string;
}

interface CartItem extends Product {
  quantity: number;
}

interface OrderItem {
  id?: number;
  productId?: number;
  productName?: string;
  name?: string;
  quantity?: number;
  price?: number;
  subtotal?: number;
  product?: {
    id?: number;
    name?: string;
    price?: number;
  };
}

interface CustomerOrder {
  id?: number | string;
  orderId?: number | string;
  customerName?: string;
  customerEmail?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  pincode?: string;
  totalAmount?: number;
  totalPrice?: number;
  amount?: number;
  status?: string;
  orderStatus?: string;
  paymentStatus?: string;
  createdAt?: string;
  orderDate?: string;
  items?: OrderItem[];
  orderItems?: OrderItem[];
  [key: string]: unknown;
}

interface LowStockProduct {
  id: number;
  name: string;
  stock: number;
}

interface BackgroundJobStatus {
  jobName?: string;
  checkInterval?: string;
  lowStockCount?: number;
  lowStockProducts?: LowStockProduct[];
}

interface RazorpayPayment {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: {
    name: string;
    contact: string;
    email: string;
  };
  notes: Record<string, string>;
  theme: {
    color: string;
  };
  handler: (payment: RazorpayPayment) => void;
  modal: {
    ondismiss: () => void;
  };
}

interface RazorpayCheckoutInstance {
  open: () => void;
}

interface RazorpayConstructor {
  new (options: RazorpayOptions): RazorpayCheckoutInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    const existingScript = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );

    if (existingScript) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);

    document.body.appendChild(script);
  });
}

function formatDate(value: unknown): string {
  if (!value || typeof value !== "string") {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatMoney(value: unknown): string {
  const amount = Number(value);

  return Number.isFinite(amount) ? `₹${amount.toFixed(2)}` : "₹0.00";
}

function getOrderId(order: CustomerOrder): string {
  return String(order.orderId ?? order.id ?? "N/A");
}

function getOrderAmount(order: CustomerOrder): number {
  const amount = Number(
    order.totalAmount ?? order.totalPrice ?? order.amount ?? 0
  );

  return Number.isFinite(amount) ? amount : 0;
}

function getOrderItems(order: CustomerOrder): OrderItem[] {
  if (Array.isArray(order.items)) {
    return order.items;
  }

  if (Array.isArray(order.orderItems)) {
    return order.orderItems;
  }

  return [];
}

function getOrderStatus(order: CustomerOrder): string {
  return String(order.status ?? order.orderStatus ?? "UNKNOWN");
}

function getPaymentStatus(order: CustomerOrder): string {
  return String(order.paymentStatus ?? "UNKNOWN");
}

function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("freshcart_token")
  );

  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem("freshcart_user");
      return saved ? (JSON.parse(saved) as User) : null;
    } catch {
      return null;
    }
  });

  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);

  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });

  const [signupData, setSignupData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [delivery, setDelivery] = useState({
    customerName: "",
    customerEmail: "",
    phone: "",
    address: "",
    city: "",
    pincode: "",
  });

  // Product management
  const [stockInputs, setStockInputs] = useState<Record<number, string>>({});
  const [savingStock, setSavingStock] = useState<number | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);

  const [newProduct, setNewProduct] = useState({
    name: "",
    description: "",
    price: "",
    stock: "",
    category: "Fruits",
    imageUrl: "",
  });

  // Admin dashboard
  const [activeAdminTab, setActiveAdminTab] = useState<
    "overview" | "orders" | "stock" | "products"
  >("overview");

  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");

  const [jobStatus, setJobStatus] = useState<BackgroundJobStatus | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobError, setJobError] = useState("");

  const isAdmin = Boolean(
    token && user?.role?.toUpperCase() === "ADMIN"
  );

  useEffect(() => {
    void fetchProducts();
  }, []);

  useEffect(() => {
    if (isAdmin && token) {
      void fetchAdminData();
    } else {
      setOrders([]);
      setJobStatus(null);
    }
  }, [isAdmin, token]);

  async function fetchProducts() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API}/api/products`);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data: Product[] = await response.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Product loading error:", err);
      setError(
        "Unable to load products. Please check the backend connection."
      );
    } finally {
      setLoading(false);
    }
  }

  async function fetchAdminData() {
    await Promise.all([fetchOrders(), fetchBackgroundJobStatus()]);
  }

  async function fetchOrders() {
    if (!token) {
      setOrdersError("Please log in as an administrator.");
      return;
    }

    try {
      setOrdersLoading(true);
      setOrdersError("");

      const response = await fetch(`${API}/api/orders`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "Admin access denied. Please log in again with an admin account."
        );
      }

      if (!response.ok) {
        throw new Error(
          `Could not load orders. Server returned ${response.status}.`
        );
      }

      const data: unknown = await response.json();

      // Supports either a direct array or a wrapped response.
      if (Array.isArray(data)) {
        setOrders(data as CustomerOrder[]);
      } else if (
        data &&
        typeof data === "object" &&
        "content" in data &&
        Array.isArray((data as { content: unknown }).content)
      ) {
        setOrders(
          (data as { content: CustomerOrder[] }).content
        );
      } else if (
        data &&
        typeof data === "object" &&
        "orders" in data &&
        Array.isArray((data as { orders: unknown }).orders)
      ) {
        setOrders(
          (data as { orders: CustomerOrder[] }).orders
        );
      } else {
        setOrders([]);
        setOrdersError(
          "The orders API returned an unexpected response format."
        );
      }
    } catch (err) {
      console.error("Fetch orders error:", err);
      setOrdersError(
        err instanceof Error
          ? err.message
          : "Unable to load customer orders."
      );
    } finally {
      setOrdersLoading(false);
    }
  }

  async function fetchBackgroundJobStatus() {
    if (!token) return;

    try {
      setJobLoading(true);
      setJobError("");

      const response = await fetch(
        `${API}/api/admin/background-job/status`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "Unable to access the low-stock monitor. Check your admin login."
        );
      }

      if (!response.ok) {
        throw new Error(
          `Background job request failed (${response.status}).`
        );
      }

      const data: BackgroundJobStatus = await response.json();
      setJobStatus(data);
    } catch (err) {
      console.error("Background job status error:", err);
      setJobError(
        err instanceof Error
          ? err.message
          : "Could not load low-stock information."
      );
    } finally {
      setJobLoading(false);
    }
  }

  async function addProduct(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!token || !isAdmin) {
      alert("Please log in with an admin account.");
      return;
    }

    const price = Number(newProduct.price);
    const stock = Number(newProduct.stock);

    if (
      !newProduct.name.trim() ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      alert(
        "Enter a product name, a price greater than 0, and a valid stock quantity."
      );
      return;
    }

    try {
      setSavingProduct(true);

      const response = await fetch(`${API}/api/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newProduct.name.trim(),
          description: newProduct.description.trim(),
          price,
          stock,
          category: newProduct.category,
          imageUrl: newProduct.imageUrl.trim() || null,
          available: stock > 0,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 401 || response.status === 403) {
        alert("Admin access denied. Please log in again.");
        return;
      }

      if (!response.ok) {
        alert(
          data.message ||
            data.error ||
            `Product addition failed (${response.status}).`
        );
        return;
      }

      alert("Product added successfully.");

      setNewProduct({
        name: "",
        description: "",
        price: "",
        stock: "",
        category: "Fruits",
        imageUrl: "",
      });

      await fetchProducts();
    } catch (err) {
      console.error("Add product error:", err);
      alert("Unable to add product. Check the backend connection.");
    } finally {
      setSavingProduct(false);
    }
  }

  async function updateStock(product: Product) {
    if (!token || !isAdmin) {
      alert("Only administrators can update stock.");
      return;
    }

    const input = stockInputs[product.id];
    const newStock = Number(input);

    if (
      input === undefined ||
      input.trim() === "" ||
      !Number.isInteger(newStock) ||
      newStock < 0
    ) {
      alert("Enter a valid stock quantity.");
      return;
    }

    try {
      setSavingStock(product.id);

      const response = await fetch(
        `${API}/api/products/${product.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...product,
            stock: newStock,
            available: newStock > 0,
          }),
        }
      );

      if (response.status === 401 || response.status === 403) {
        alert("Admin access denied. Please log in again.");
        return;
      }

      if (!response.ok) {
        const message = await response.text();
        alert(`Stock update failed (${response.status}). ${message}`);
        return;
      }

      alert(`${product.name} stock updated to ${newStock}.`);

      setStockInputs((current) => {
        const updated = { ...current };
        delete updated[product.id];
        return updated;
      });

      await fetchProducts();
      await fetchBackgroundJobStatus();
    } catch (err) {
      console.error("Stock update error:", err);
      alert("Unable to update stock.");
    } finally {
      setSavingStock(null);
    }
  }

  function addToCart(product: Product) {
    if (product.available === false || product.stock <= 0) {
      alert("This product is out of stock.");
      return;
    }

    setCart((current) => {
      const existing = current.find(
        (item) => item.id === product.id
      );

      if (existing) {
        if (existing.quantity >= product.stock) {
          alert("Maximum available stock reached.");
          return current;
        }

        return current.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...current, { ...product, quantity: 1 }];
    });
  }

  function changeQuantity(id: number, amount: number) {
    setCart((current) =>
      current
        .map((item) => {
          if (item.id !== id) return item;

          const quantity = item.quantity + amount;

          if (quantity > item.stock) {
            alert("Maximum available stock reached.");
            return item;
          }

          return { ...item, quantity };
        })
        .filter((item) => item.quantity > 0)
    );
  }

  function removeFromCart(id: number) {
    setCart((current) =>
      current.filter((item) => item.id !== id)
    );
  }

  async function login() {
    try {
      const response = await fetch(`${API}/api/users/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(loginData),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "Login failed. Check your credentials.");
        return;
      }

      if (!data.token) {
        alert("Login response did not contain a token.");
        return;
      }

      const loggedUser: User = {
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role || "CUSTOMER",
      };

      localStorage.setItem("freshcart_token", data.token);
      localStorage.setItem(
        "freshcart_user",
        JSON.stringify(loggedUser)
      );

      setToken(data.token);
      setUser(loggedUser);
      setShowLogin(false);
      setLoginData({ email: "", password: "" });

      alert(`Welcome, ${loggedUser.name}!`);

      if (loggedUser.role?.toUpperCase() === "ADMIN") {
        setActiveAdminTab("overview");
      }
    } catch (err) {
      console.error("Login error:", err);
      alert("Cannot connect to the backend.");
    }
  }

  async function signup() {
    if (
      !signupData.name.trim() ||
      !signupData.email.trim() ||
      !signupData.password
    ) {
      alert("Please fill in all fields.");
      return;
    }

    try {
      const response = await fetch(`${API}/api/users/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: signupData.name.trim(),
          email: signupData.email.trim(),
          password: signupData.password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(data.message || "Registration failed.");
        return;
      }

      alert("Registration successful! Please log in.");

      setShowSignup(false);
      setShowLogin(true);

      setLoginData({
        email: signupData.email,
        password: "",
      });

      setSignupData({
        name: "",
        email: "",
        password: "",
      });
    } catch (err) {
      console.error("Signup error:", err);
      alert("Cannot connect to the backend.");
    }
  }

  function logout() {
    localStorage.removeItem("freshcart_token");
    localStorage.removeItem("freshcart_user");

    setToken(null);
    setUser(null);
    setCart([]);
    setOrders([]);
    setJobStatus(null);
    setShowCheckout(false);
    setShowLogin(false);
    setShowSignup(false);

    alert("Logged out successfully.");
  }

  function openCheckout() {
    if (!cart.length) {
      alert("Your cart is empty.");
      return;
    }

    if (!token || !user) {
      alert("Please log in before placing an order.");
      setShowLogin(true);
      return;
    }

    setDelivery((current) => ({
      ...current,
      customerName: current.customerName || user.name,
      customerEmail: user.email,
    }));

    setShowCheckout(true);
  }

  async function placeOrder() {
    if (!token || !user) {
      alert("Please log in first.");
      setShowCheckout(false);
      setShowLogin(true);
      return;
    }

    if (
      !delivery.customerName.trim() ||
      !delivery.phone.trim() ||
      !delivery.address.trim() ||
      !delivery.city.trim() ||
      !delivery.pincode.trim()
    ) {
      alert("Please fill in all delivery details.");
      return;
    }

    if (!/^\d{10}$/.test(delivery.phone)) {
      alert("Enter a valid 10-digit phone number.");
      return;
    }

    if (!/^\d{6}$/.test(delivery.pincode)) {
      alert("Enter a valid 6-digit PIN code.");
      return;
    }

    try {
      setPlacingOrder(true);

      const response = await fetch(`${API}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...delivery,
          items: cart.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 401 || response.status === 403) {
        alert("Session expired or access denied. Please log in again.");
        logout();
        setShowLogin(true);
        return;
      }

      if (!response.ok) {
        alert(
          data.message ||
            data.error ||
            "Could not start payment."
        );
        return;
      }

      if (
        !data.keyId ||
        !data.razorpayOrderId ||
        !data.orderId ||
        !data.amount
      ) {
        console.error("Unexpected order response:", data);
        alert(
          "Backend did not return the required Razorpay order details."
        );
        return;
      }

      const loaded = await loadRazorpay();

      if (!loaded) {
        alert("Unable to load Razorpay Checkout. Check your internet.");
        return;
      }

      const RazorpayCheckout = window.Razorpay;

      if (!RazorpayCheckout) {
        alert("Razorpay Checkout did not load. Please refresh.");
        return;
      }

      const options: RazorpayOptions = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency || "INR",
        name: "Fresh Cart",
        description: `Grocery order #${data.orderId}`,
        order_id: data.razorpayOrderId,
        prefill: {
          name: delivery.customerName,
          contact: delivery.phone,
          email: user.email,
        },
        notes: {
          local_order_id: String(data.orderId),
        },
        theme: {
          color: "#2f7d46",
        },

        handler: async (payment: RazorpayPayment) => {
          try {
            const verifyResponse = await fetch(
              `${API}/api/orders/verify-payment`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  orderId: String(data.orderId),
                  razorpay_payment_id: payment.razorpay_payment_id,
                  razorpay_order_id: payment.razorpay_order_id,
                  razorpay_signature: payment.razorpay_signature,
                }),
              }
            );

            const verification = await verifyResponse
              .json()
              .catch(() => ({}));

            if (
              !verifyResponse.ok ||
              verification.paymentStatus !== "PAID"
            ) {
              console.error(
                "Payment verification failed:",
                verification
              );

              alert(
                verification.error ||
                  "Payment could not be verified. Please contact support if money was deducted."
              );
              return;
            }

            alert(
              `Payment successful! Order #${data.orderId} is confirmed.`
            );

            setCart([]);
            setShowCheckout(false);

            setDelivery({
              customerName: user.name,
              customerEmail: user.email,
              phone: "",
              address: "",
              city: "",
              pincode: "",
            });

            await fetchProducts();

            if (isAdmin) {
              await fetchOrders();
            }
          } catch (verificationError) {
            console.error(
              "Payment verification request failed:",
              verificationError
            );

            alert(
              "We could not confirm payment with the server. Please contact support before trying again."
            );
          }
        },

        modal: {
          ondismiss: () => {
            alert(
              "Payment was not completed. The order remains pending until payment is verified."
            );
          },
        },
      };

      const checkout = new RazorpayCheckout(options);
      checkout.open();
    } catch (err) {
      console.error("Order/payment error:", err);
      alert("Unable to start payment. Check the backend connection.");
    } finally {
      setPlacingOrder(false);
    }
  }

  const categories = [
    "All",
    ...Array.from(
      new Set(
        products
          .map((product) => product.category)
          .filter(Boolean)
      )
    ),
  ];

  const filteredProducts = products.filter((product) => {
    const text = search.toLowerCase();

    const matchesSearch =
      product.name.toLowerCase().includes(text) ||
      (product.description || "").toLowerCase().includes(text);

    const matchesCategory =
      category === "All" || product.category === category;

    return matchesSearch && matchesCategory;
  });

  const cartCount = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const lowStockProducts = products.filter(
    (product) => product.stock <= 5
  );

  const paidOrders = orders.filter(
    (order) => getPaymentStatus(order).toUpperCase() === "PAID"
  );

  const totalRevenue = paidOrders.reduce(
    (sum, order) => sum + getOrderAmount(order),
    0
  );

  return (
    <div className="app">
      <header className="navbar">
        <a
          className="brand"
          href="#top"
          onClick={(event) => event.preventDefault()}
        >
          🛒 Fresh<span>Cart</span>
        </a>

        <div className="search-box">
          <span>🔍</span>
          <input
            type="search"
            placeholder="Search groceries..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="user-area">
          <span className="cart-indicator">🛒 {cartCount}</span>

          {user && token ? (
            <>
              <span>Hi, {user.name}</span>

              <span
                className={`role-badge ${
                  isAdmin ? "admin-badge" : "customer-badge"
                }`}
              >
                {isAdmin ? "👑 ADMIN" : "🛍️ CUSTOMER"}
              </span>

              <button className="nav-button" onClick={logout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <button
                className="nav-button"
                onClick={() => setShowLogin(true)}
              >
                Login
              </button>

              <button
                className="nav-button primary"
                onClick={() => setShowSignup(true)}
              >
                Sign Up
              </button>
            </>
          )}
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-content">
          <span className="hero-tag">
            FRESHNESS DELIVERED DAILY
          </span>

          <h1>
            Fresh groceries,
            <br />
            <span>happy living.</span>
          </h1>

          <p>
            Farm-fresh fruits, vegetables, dairy and everyday
            essentials delivered to your doorstep.
          </p>

          <button
            className="hero-button"
            onClick={() =>
              document
                .getElementById("products")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Shop groceries →
          </button>
        </div>

        <div className="hero-emoji">
          <span>🍌</span>
          <span>🍎</span>
          <span>🥦</span>
          <span>🥛</span>
          <span>🥕</span>
        </div>
      </section>

      <section className="features">
        <div className="feature">
          <span>🚚</span>
          <div>
            <strong>Quick Delivery</strong>
            <p>Delivered to your door</p>
          </div>
        </div>

        <div className="feature">
          <span>🌿</span>
          <div>
            <strong>Fresh Products</strong>
            <p>Quality you can trust</p>
          </div>
        </div>

        <div className="feature">
          <span>🔒</span>
          <div>
            <strong>Secure Shopping</strong>
            <p>Shop with confidence</p>
          </div>
        </div>
      </section>

      {/* ADMIN DASHBOARD */}
      {isAdmin && (
        <section className="admin-dashboard">
          <div className="admin-dashboard-header">
            <div>
              <span className="section-label">
                FRESHCART MANAGEMENT
              </span>
              <h2>👑 Admin Dashboard</h2>
              <p>
                Manage products, monitor stock and view customer orders.
              </p>
            </div>

            <button
              className="add-btn"
              onClick={() => void fetchAdminData()}
              disabled={ordersLoading || jobLoading}
            >
              {ordersLoading || jobLoading
                ? "Refreshing..."
                : "↻ Refresh Dashboard"}
            </button>
          </div>

          <nav className="admin-tabs">
            <button
              className={activeAdminTab === "overview" ? "active" : ""}
              onClick={() => setActiveAdminTab("overview")}
            >
              📊 Overview
            </button>

            <button
              className={activeAdminTab === "orders" ? "active" : ""}
              onClick={() => {
                setActiveAdminTab("orders");
                void fetchOrders();
              }}
            >
              📦 Customer Orders ({orders.length})
            </button>

            <button
              className={activeAdminTab === "stock" ? "active" : ""}
              onClick={() => {
                setActiveAdminTab("stock");
                void fetchBackgroundJobStatus();
              }}
            >
              ⚠️ Low Stock
            </button>

            <button
              className={activeAdminTab === "products" ? "active" : ""}
              onClick={() => setActiveAdminTab("products")}
            >
              🥬 Manage Products
            </button>
          </nav>

          {/* OVERVIEW TAB */}
          {activeAdminTab === "overview" && (
            <div className="admin-tab-content">
              <div className="dashboard-stats">
                <article className="dashboard-stat">
                  <span>🥬</span>
                  <p>Total Products</p>
                  <h3>{products.length}</h3>
                </article>

                <article className="dashboard-stat">
                  <span>📦</span>
                  <p>Total Orders</p>
                  <h3>
                    {ordersLoading ? "..." : orders.length}
                  </h3>
                </article>

                <article className="dashboard-stat">
                  <span>💳</span>
                  <p>Paid Orders</p>
                  <h3>{paidOrders.length}</h3>
                </article>

                <article className="dashboard-stat">
                  <span>💰</span>
                  <p>Revenue from Paid Orders</p>
                  <h3>{formatMoney(totalRevenue)}</h3>
                </article>

                <article className="dashboard-stat warning-stat">
                  <span>⚠️</span>
                  <p>Low-Stock Products</p>
                  <h3>{lowStockProducts.length}</h3>
                </article>
              </div>

              <div className="dashboard-panels">
                <article className="dashboard-panel">
                  <h3>📦 Recent Customer Orders</h3>

                  {ordersLoading ? (
                    <p>Loading orders...</p>
                  ) : ordersError ? (
                    <div className="error-message">
                      <p>{ordersError}</p>
                      <button
                        className="add-btn"
                        onClick={() => void fetchOrders()}
                      >
                        Try Again
                      </button>
                    </div>
                  ) : orders.length === 0 ? (
                    <p>No customer orders found.</p>
                  ) : (
                    <div className="table-wrapper">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Order ID</th>
                            <th>Customer</th>
                            <th>Amount</th>
                            <th>Payment</th>
                            <th>Status</th>
                          </tr>
                        </thead>

                        <tbody>
                          {orders.slice(0, 5).map((order, index) => (
                            <tr key={getOrderId(order) + index}>
                              <td>#{getOrderId(order)}</td>
                              <td>
                                {order.customerName || "Customer"}
                                <small className="table-subtext">
                                  {order.customerEmail ||
                                    order.email ||
                                    ""}
                                </small>
                              </td>
                              <td>
                                {formatMoney(getOrderAmount(order))}
                              </td>
                              <td>
                                <span className="status-badge">
                                  {getPaymentStatus(order)}
                                </span>
                              </td>
                              <td>
                                {getOrderStatus(order)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <button
                    className="add-btn dashboard-action"
                    onClick={() => {
                      setActiveAdminTab("orders");
                      void fetchOrders();
                    }}
                  >
                    View All Orders →
                  </button>
                </article>

                <article className="dashboard-panel">
                  <h3>⚠️ Low-Stock Alerts</h3>

                  {jobLoading ? (
                    <p>Checking stock...</p>
                  ) : jobError ? (
                    <p className="error-text">{jobError}</p>
                  ) : lowStockProducts.length === 0 ? (
                    <p>All products have sufficient stock.</p>
                  ) : (
                    <div className="low-stock-list">
                      {lowStockProducts.slice(0, 5).map((product) => (
                        <div
                          className="low-stock-item"
                          key={product.id}
                        >
                          <div>
                            <strong>{product.name}</strong>
                            <p>Product ID: {product.id}</p>
                          </div>

                          <span>{product.stock} left</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    className="add-btn dashboard-action"
                    onClick={() => {
                      setActiveAdminTab("stock");
                      void fetchBackgroundJobStatus();
                    }}
                  >
                    View Stock Alerts →
                  </button>
                </article>
              </div>
            </div>
          )}

          {/* CUSTOMER ORDERS TAB */}
          {activeAdminTab === "orders" && (
            <div className="admin-tab-content">
              <div className="tab-title-row">
                <div>
                  <h3>📦 Customer Orders</h3>
                  <p>
                    Orders placed by customers on FreshCart.
                  </p>
                </div>

                <button
                  className="add-btn"
                  onClick={() => void fetchOrders()}
                  disabled={ordersLoading}
                >
                  {ordersLoading ? "Loading..." : "↻ Refresh Orders"}
                </button>
              </div>

              {ordersLoading ? (
                <div className="dashboard-message">
                  Loading customer orders...
                </div>
              ) : ordersError ? (
                <div className="dashboard-message error-message">
                  <p>{ordersError}</p>
                  <button
                    className="add-btn"
                    onClick={() => void fetchOrders()}
                  >
                    Try Again
                  </button>
                </div>
              ) : orders.length === 0 ? (
                <div className="dashboard-message">
                  <span>📭</span>
                  <h3>No Orders Found</h3>
                  <p>
                    Customer orders will appear here after the backend
                    saves them and the orders API returns them.
                  </p>
                </div>
              ) : (
                <div className="orders-list">
                  {orders.map((order, index) => {
                    const items = getOrderItems(order);

                    return (
                      <article
                        className="order-card"
                        key={getOrderId(order) + index}
                      >
                        <div className="order-card-header">
                          <div>
                            <span className="order-number">
                              Order #{getOrderId(order)}
                            </span>
                            <p>
                              {formatDate(
                                order.createdAt ?? order.orderDate
                              )}
                            </p>
                          </div>

                          <div className="order-badges">
                            <span className="status-badge">
                              {getOrderStatus(order)}
                            </span>

                            <span
                              className={`status-badge ${
                                getPaymentStatus(order).toUpperCase() ===
                                "PAID"
                                  ? "paid-badge"
                                  : "pending-badge"
                              }`}
                            >
                              {getPaymentStatus(order)}
                            </span>
                          </div>
                        </div>

                        <div className="order-details-grid">
                          <div>
                            <strong>Customer Name</strong>
                            <p>
                              {order.customerName || "Not provided"}
                            </p>
                          </div>

                          <div>
                            <strong>Email</strong>
                            <p>
                              {order.customerEmail ||
                                order.email ||
                                "Not provided"}
                            </p>
                          </div>

                          <div>
                            <strong>Phone</strong>
                            <p>{order.phone || "Not provided"}</p>
                          </div>

                          <div>
                            <strong>Delivery Address</strong>
                            <p>
                              {[
                                order.address,
                                order.city,
                                order.pincode,
                              ]
                                .filter(Boolean)
                                .join(", ") || "Not provided"}
                            </p>
                          </div>
                        </div>

                        <div className="order-items-section">
                          <strong>Ordered Products</strong>

                          {items.length === 0 ? (
                            <p>
                              No item details were returned by the API.
                            </p>
                          ) : (
                            <div className="table-wrapper">
                              <table className="admin-table">
                                <thead>
                                  <tr>
                                    <th>Product</th>
                                    <th>Quantity</th>
                                    <th>Price</th>
                                  </tr>
                                </thead>

                                <tbody>
                                  {items.map((item, itemIndex) => (
                                    <tr
                                      key={
                                        String(item.id ?? item.productId ?? "") +
                                        itemIndex
                                      }
                                    >
                                      <td>
                                        {item.productName ||
                                          item.name ||
                                          item.product?.name ||
                                          `Product ${item.productId ?? ""}`}
                                      </td>

                                      <td>{item.quantity ?? 0}</td>

                                      <td>
                                        {formatMoney(
                                          item.price ??
                                            item.subtotal ??
                                            item.product?.price ??
                                            0
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        <div className="order-total-row">
                          <span>Order Total</span>
                          <strong>
                            {formatMoney(getOrderAmount(order))}
                          </strong>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* LOW STOCK TAB */}
          {activeAdminTab === "stock" && (
            <div className="admin-tab-content">
              <div className="tab-title-row">
                <div>
                  <h3>⚠️ Low-Stock Monitor</h3>
                  <p>
                    The backend background job checks product stock
                    periodically.
                  </p>
                </div>

                <button
                  className="add-btn"
                  onClick={() => void fetchBackgroundJobStatus()}
                  disabled={jobLoading}
                >
                  {jobLoading ? "Checking..." : "↻ Refresh Stock"}
                </button>
              </div>

              {jobStatus && (
                <div className="job-status-card">
                  <h4>
                    {jobStatus.jobName || "Low Stock Checker"}
                  </h4>
                  <p>
                    Check interval:{" "}
                    {jobStatus.checkInterval || "Not available"}
                  </p>
                  <p>
                    Low-stock products reported by backend:{" "}
                    <strong>
                      {jobStatus.lowStockCount ?? 0}
                    </strong>
                  </p>
                </div>
              )}

              {jobError && (
                <div className="error-message">
                  <p>{jobError}</p>
                </div>
              )}

              {jobLoading ? (
                <p>Loading stock information...</p>
              ) : lowStockProducts.length === 0 ? (
                <div className="dashboard-message">
                  <h3>✅ Stock Looks Good</h3>
                  <p>
                    No products with stock at or below 5 were found.
                  </p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Product ID</th>
                        <th>Product Name</th>
                        <th>Available Stock</th>
                        <th>Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {lowStockProducts.map((product) => (
                        <tr key={product.id}>
                          <td>{product.id}</td>
                          <td>{product.name}</td>
                          <td>
                            <span className="low-stock-badge">
                              {product.stock}
                            </span>
                          </td>
                          <td>
                            <button
                              className="add-btn"
                              onClick={() => {
                                setActiveAdminTab("products");
                                setStockInputs((current) => ({
                                  ...current,
                                  [product.id]: String(product.stock),
                                }));
                              }}
                            >
                              Update Stock
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* PRODUCT MANAGEMENT TAB */}
          {activeAdminTab === "products" && (
            <div className="admin-tab-content">
              <h3>🥬 Product Management</h3>
              <p>Add new products and update existing stock quantities.</p>

              <form
                className="admin-product-form"
                onSubmit={(event) => void addProduct(event)}
              >
                <h4>Add New Product</h4>

                <input
                  required
                  type="text"
                  placeholder="Product name"
                  value={newProduct.name}
                  onChange={(event) =>
                    setNewProduct({
                      ...newProduct,
                      name: event.target.value,
                    })
                  }
                />

                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Price (₹)"
                  value={newProduct.price}
                  onChange={(event) =>
                    setNewProduct({
                      ...newProduct,
                      price: event.target.value,
                    })
                  }
                />

                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Stock quantity"
                  value={newProduct.stock}
                  onChange={(event) =>
                    setNewProduct({
                      ...newProduct,
                      stock: event.target.value,
                    })
                  }
                />

                <select
                  value={newProduct.category}
                  onChange={(event) =>
                    setNewProduct({
                      ...newProduct,
                      category: event.target.value,
                    })
                  }
                >
                  <option value="Fruits">Fruits</option>
                  <option value="Vegetables">Vegetables</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Grains">Grains</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Snacks">Snacks</option>
                  <option value="Groceries">Groceries</option>
                </select>

                <input
                  type="url"
                  placeholder="Image URL (optional)"
                  value={newProduct.imageUrl}
                  onChange={(event) =>
                    setNewProduct({
                      ...newProduct,
                      imageUrl: event.target.value,
                    })
                  }
                />

                <textarea
                  placeholder="Product description (optional)"
                  value={newProduct.description}
                  onChange={(event) =>
                    setNewProduct({
                      ...newProduct,
                      description: event.target.value,
                    })
                  }
                  rows={3}
                />

                <button
                  type="submit"
                  className="add-btn"
                  disabled={savingProduct}
                >
                  {savingProduct ? "Adding..." : "+ Add Product"}
                </button>
              </form>

              <h3 className="manage-products-title">
                Existing Products ({products.length})
              </h3>

              <div className="table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Product</th>
                      <th>Price</th>
                      <th>Current Stock</th>
                      <th>New Stock</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id}>
                        <td>{product.id}</td>
                        <td>{product.name}</td>
                        <td>{formatMoney(product.price)}</td>
                        <td>{product.stock}</td>
                        <td>
                          <input
                            className="stock-input"
                            type="number"
                            min="0"
                            step="1"
                            aria-label={`New stock for ${product.name}`}
                            value={
                              stockInputs[product.id] ??
                              String(product.stock)
                            }
                            onChange={(event) =>
                              setStockInputs((current) => ({
                                ...current,
                                [product.id]: event.target.value,
                              }))
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="add-btn"
                            disabled={savingStock === product.id}
                            onClick={() =>
                              void updateStock(product)
                            }
                          >
                            {savingStock === product.id
                              ? "Saving..."
                              : "Save Stock"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* CUSTOMER SHOPPING */}
      <main id="products" className="main-content">
        <div className="section-heading">
          <div>
            <span className="section-label">OUR COLLECTION</span>
            <h2>Shop groceries</h2>
            <p>Everything you need, all in one place.</p>
          </div>

          <span className="product-count">
            {filteredProducts.length} products
          </span>
        </div>

        <div className="category-list">
          {categories.map((item) => (
            <button
              key={item}
              className={`category-button ${
                category === item ? "selected" : ""
              }`}
              onClick={() => setCategory(item)}
            >
              {item === "All" ? "🛍️" : "🥬"} {item}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="empty">
            <div>🥬</div>
            <h3>Loading fresh products...</h3>
            <p>Please wait a moment.</p>
          </div>
        ) : error ? (
          <div className="empty">
            <div>⚠️</div>
            <h3>Products could not be loaded</h3>
            <p>{error}</p>
            <button
              className="add-btn"
              onClick={() => void fetchProducts()}
            >
              Try Again
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty">
            <div>🔎</div>
            <h3>No products found</h3>
            <p>Try another search or category.</p>
          </div>
        ) : (
          <div className="product-grid">
            {filteredProducts.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="product-image">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <span>🥬</span>
                  )}

                  {product.stock <= 0 ||
                  product.available === false ? (
                    <span className="stock-badge">
                      Out of stock
                    </span>
                  ) : (
                    <span className="fresh-badge">
                      Fresh pick
                    </span>
                  )}
                </div>

                <div className="product-info">
                  <span className="product-category">
                    {product.category || "Groceries"}
                  </span>

                  <h3>{product.name}</h3>

                  <p className="product-description">
                    {product.description ||
                      "Fresh quality product."}
                  </p>

                  <div className="product-bottom">
                    <div className="product-price">
                      <strong>
                        {formatMoney(product.price)}
                      </strong>
                      <small>{product.stock} available</small>
                    </div>

                    <button
                      className="add-btn"
                      disabled={
                        product.stock <= 0 ||
                        product.available === false
                      }
                      onClick={() => addToCart(product)}
                    >
                      {product.stock > 0 &&
                      product.available !== false
                        ? "+ Add"
                        : "Unavailable"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* SHOPPING CART */}
      {cart.length > 0 && (
        <aside className="cart-panel">
          <div className="cart-header">
            <h2>🛒 Your Cart</h2>
            <span>{cartCount} items</span>
          </div>

          <div className="cart-items">
            {cart.map((item) => (
              <div className="cart-item" key={item.id}>
                <div className="cart-item-info">
                  <strong>{item.name}</strong>
                  <p>{formatMoney(item.price)} each</p>
                </div>

                <div className="quantity">
                  <button
                    aria-label={`Decrease ${item.name}`}
                    onClick={() =>
                      changeQuantity(item.id, -1)
                    }
                  >
                    −
                  </button>

                  <span>{item.quantity}</span>

                  <button
                    aria-label={`Increase ${item.name}`}
                    onClick={() =>
                      changeQuantity(item.id, 1)
                    }
                  >
                    +
                  </button>
                </div>

                <button
                  className="remove-btn"
                  onClick={() => removeFromCart(item.id)}
                  aria-label={`Remove ${item.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="cart-total">
            <span>Total</span>
            <strong>{formatMoney(cartTotal)}</strong>
          </div>

          <button
            className="checkout-btn"
            onClick={openCheckout}
          >
            Proceed to Checkout →
          </button>
        </aside>
      )}

      {/* LOGIN MODAL */}
      {showLogin && (
        <div className="modal-overlay">
          <div className="modal">
            <button
              className="close"
              onClick={() => setShowLogin(false)}
              aria-label="Close login"
            >
              ×
            </button>

            <div className="modal-icon">👋</div>
            <h2>Welcome Back</h2>
            <p>Login to your FreshCart account.</p>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void login();
              }}
            >
              <input
                required
                type="email"
                placeholder="Email address"
                value={loginData.email}
                onChange={(event) =>
                  setLoginData({
                    ...loginData,
                    email: event.target.value,
                  })
                }
              />

              <input
                required
                type="password"
                placeholder="Password"
                value={loginData.password}
                onChange={(event) =>
                  setLoginData({
                    ...loginData,
                    password: event.target.value,
                  })
                }
              />

              <button className="modal-btn" type="submit">
                Login
              </button>
            </form>

            <p className="switch">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setShowLogin(false);
                  setShowSignup(true);
                }}
              >
                Sign Up
              </button>
            </p>
          </div>
        </div>
      )}

      {/* SIGNUP MODAL */}
      {showSignup && (
        <div className="modal-overlay">
          <div className="modal">
            <button
              className="close"
              onClick={() => setShowSignup(false)}
              aria-label="Close signup"
            >
              ×
            </button>

            <div className="modal-icon">✏️</div>
            <h2>Create Account</h2>
            <p>Join FreshCart today.</p>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void signup();
              }}
            >
              <input
                required
                type="text"
                placeholder="Full name"
                value={signupData.name}
                onChange={(event) =>
                  setSignupData({
                    ...signupData,
                    name: event.target.value,
                  })
                }
              />

              <input
                required
                type="email"
                placeholder="Email address"
                value={signupData.email}
                onChange={(event) =>
                  setSignupData({
                    ...signupData,
                    email: event.target.value,
                  })
                }
              />

              <input
                required
                type="password"
                minLength={6}
                placeholder="Password (minimum 6 characters)"
                value={signupData.password}
                onChange={(event) =>
                  setSignupData({
                    ...signupData,
                    password: event.target.value,
                  })
                }
              />

              <button className="modal-btn" type="submit">
                Create Account
              </button>
            </form>

            <p className="switch">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setShowSignup(false);
                  setShowLogin(true);
                }}
              >
                Login
              </button>
            </p>
          </div>
        </div>
      )}

      {/* CHECKOUT MODAL */}
      {showCheckout && (
        <div className="modal-overlay">
          <div className="modal">
            <button
              className="close"
              disabled={placingOrder}
              onClick={() => setShowCheckout(false)}
              aria-label="Close checkout"
            >
              ×
            </button>

            <div className="modal-icon">🚚</div>
            <h2>Delivery Details</h2>
            <p>Where should we deliver your groceries?</p>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void placeOrder();
              }}
            >
              <input
                required
                type="text"
                placeholder="Full name"
                value={delivery.customerName}
                onChange={(event) =>
                  setDelivery({
                    ...delivery,
                    customerName: event.target.value,
                  })
                }
              />

              <input
                required
                type="tel"
                pattern="[0-9]{10}"
                maxLength={10}
                placeholder="10-digit phone number"
                value={delivery.phone}
                onChange={(event) =>
                  setDelivery({
                    ...delivery,
                    phone: event.target.value,
                  })
                }
              />

              <input
                required
                type="text"
                placeholder="Delivery address"
                value={delivery.address}
                onChange={(event) =>
                  setDelivery({
                    ...delivery,
                    address: event.target.value,
                  })
                }
              />

              <input
                required
                type="text"
                placeholder="City"
                value={delivery.city}
                onChange={(event) =>
                  setDelivery({
                    ...delivery,
                    city: event.target.value,
                  })
                }
              />

              <input
                required
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="6-digit PIN code"
                value={delivery.pincode}
                onChange={(event) =>
                  setDelivery({
                    ...delivery,
                    pincode: event.target.value,
                  })
                }
              />

              <div className="cart-total">
                <span>Order total</span>
                <strong>{formatMoney(cartTotal)}</strong>
              </div>

              <button
                className="modal-btn"
                type="submit"
                disabled={placingOrder}
              >
                {placingOrder
                  ? "Starting Payment..."
                  : "Proceed to Payment"}
              </button>
            </form>
          </div>
        </div>
      )}

      <footer className="footer">
        <div className="footer-brand">🛒 FreshCart</div>
        <p>Fresh groceries. Better living.</p>
        <small>© 2026 FreshCart. All rights reserved.</small>
      </footer>
    </div>
  );
}

export default App;