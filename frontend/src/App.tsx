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

// Load Razorpay Checkout only when the customer is ready to pay.

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

    phone: "",

    address: "",

    city: "",

    pincode: "",

  });

  // Admin stock editor state
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

  useEffect(() => {

    void fetchProducts();

  }, []);

  async function fetchProducts() {

    try {

      setLoading(true);

      setError("");

      const response = await fetch(`${API}/api/products`);

      if (!response.ok) {

        throw new Error(`Server returned ${response.status}`);

      }

      const data: Product[] = await response.json();

      setProducts(data);

      console.log("Products loaded:", data);

    } catch (err) {

      console.error("Product loading error:", err);

      setError("Unable to load products. Please check the backend connection.");

    } finally {

      setLoading(false);

    }

  }

  async function addProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || user?.role?.toUpperCase() !== "ADMIN") {
      alert("Only admins can add products. Please log in with an admin account.");
      return;
    }

    const price = Number(newProduct.price);
    const stock = Number(newProduct.stock);

    if (!newProduct.name.trim() || !Number.isFinite(price) || price <= 0
      || !Number.isInteger(stock) || stock < 0) {
      alert("Enter a product name, a price greater than 0, and a whole stock quantity of 0 or more.");
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
        alert("Admin access denied. Please log in with an admin account.");
        return;
      }
      if (!response.ok) {
        alert(data.message || data.error || `Product add failed (${response.status}).`);
        return;
      }

      alert(`Product "${data.name || newProduct.name.trim()}" added successfully.`);
      setNewProduct({ name: "", description: "", price: "", stock: "", category: "Fruits", imageUrl: "" });
      await fetchProducts();
    } catch (err) {
      console.error("Add product error:", err);
      alert("Unable to add product. Check the backend connection.");
    } finally {
      setSavingProduct(false);
    }
  }

  async function updateStock(product: Product) {

    if (!token || user?.role?.toUpperCase() !== "ADMIN") {

      alert("Only admins can update stock.");

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

      alert("Enter a valid stock quantity (0 or more).");

      return;

    }

    try {

      setSavingStock(product.id);

      const response = await fetch(`${API}/api/products/${product.id}`, {

        method: "PUT",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${token}`,

        },

        body: JSON.stringify({

          ...product,

          stock: newStock,

        }),

      });

      if (response.status === 401 || response.status === 403) {

        alert("Admin access denied. Please log in with an admin account.");

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

    } catch (err) {

      console.error("Stock update error:", err);

      alert("Unable to update stock. Check the backend connection.");

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

      const existing = current.find((item) => item.id === product.id);

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

    setCart((current) => current.filter((item) => item.id !== id));

  }

  async function login() {

    try {

      const response = await fetch(`${API}/api/users/login`, {

        method: "POST",

        headers: { "Content-Type": "application/json" },

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

      localStorage.setItem("freshcart_user", JSON.stringify(loggedUser));

      setToken(data.token);

      setUser(loggedUser);

      setShowLogin(false);

      setLoginData({ email: "", password: "" });

      alert(`Welcome, ${loggedUser.name}!`);

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

        headers: { "Content-Type": "application/json" },

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

      setSignupData({ name: "", email: "", password: "" });

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

    setShowCheckout(false);

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

      // The backend creates a pending local order and a Razorpay order.

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

        alert("Session expired. Please log in again.");

        logout();

        setShowLogin(true);

        return;

      }

      if (!response.ok) {

        alert(data.message || data.error || "Could not start payment.");

        return;

      }

      // Match the response fields returned by the existing OrderController.

      if (!data.keyId || !data.razorpayOrderId || !data.orderId || !data.amount) {

        console.error("Unexpected order response:", data);

        alert("The backend did not return the required Razorpay order details.");

        return;

      }

      const loaded = await loadRazorpay();

      if (!loaded) {

        alert("Unable to load Razorpay Checkout. Please check your internet connection and try again.");

        return;

      }

      const options = {

        key: data.keyId,

        amount: data.amount, // Backend returns amount in paise.

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

        theme: { color: "#2f7d46" },

        handler: async (payment: {

          razorpay_payment_id: string;

          razorpay_order_id: string;

          razorpay_signature: string;

        }) => {

          try {

            const verifyResponse = await fetch(`${API}/api/orders/verify-payment`, {

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

            });

            const verification = await verifyResponse.json().catch(() => ({}));

            if (!verifyResponse.ok || verification.paymentStatus !== "PAID") {

              console.error("Payment verification failed:", verification);

              alert(verification.error || "Payment could not be verified. Your order has not been confirmed. Contact support if money was deducted.");

              return;

            }

            alert(`Payment successful! Order #${data.orderId} is confirmed.`);

            setCart([]);

            setShowCheckout(false);

            setDelivery({

              customerName: user.name,

              phone: "",

              address: "",

              city: "",

              pincode: "",

            });

            void fetchProducts();

          } catch (verificationError) {

            console.error("Payment verification request failed:", verificationError);

            alert("We could not confirm the payment with the server. Please contact support before trying to pay again.");

          }

        },

        modal: {

          ondismiss: () => {

            alert("Payment was not completed. Your order remains pending until payment is verified.");

          },

        },

      };

      const RazorpayCheckout = (window as any).Razorpay;

      if (!RazorpayCheckout) {

        alert("Razorpay Checkout did not load. Please refresh and try again.");

        return;

      }

      const checkout = new RazorpayCheckout(options);

      checkout.open();

    } catch (err) {

      console.error("Order/payment error:", err);

      alert("Unable to start payment. Check the backend connection and try again.");

    } finally {

      setPlacingOrder(false);

    }

  }

  const categories = [

    "All",

    ...Array.from(

      new Set(products.map((product) => product.category).filter(Boolean))

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

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const cartTotal = cart.reduce(

    (sum, item) => sum + item.price * item.quantity,

    0

  );

  const isAdmin = Boolean(token && user?.role?.toUpperCase() === "ADMIN");

  return (

    <div className="app">

      <header className="navbar">

        <a className="brand" href="#top" onClick={(event) => event.preventDefault()}>

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

              <button className="nav-button" onClick={() => setShowLogin(true)}>

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

          <span className="hero-tag">FRESHNESS DELIVERED DAILY</span>

          <h1>

            Fresh groceries,

            <br />

            <span>happy living.</span>

          </h1>

          <p>

            Farm-fresh fruits, vegetables, dairy and everyday essentials

            delivered to your doorstep.

          </p>

          <button

            className="hero-button"

            onClick={() =>

              document.getElementById("products")?.scrollIntoView({

                behavior: "smooth",

              })

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

      <main id="products" className="main-content">

        <div className="section-heading">

          <div>

            <span className="section-label">OUR COLLECTION</span>

            <h2>Shop groceries</h2>

            <p>Everything you need, all in one place.</p>

          </div>

          <span className="product-count">{filteredProducts.length} products</span>

        </div>

        {isAdmin && (
          <>
            <div className="admin-stock-notice">
              <strong>Admin product management</strong>
              <p>Add a new product here, or change an existing product quantity and select Save Stock.</p>
            </div>

            <form
              onSubmit={(event) => void addProduct(event)}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
                padding: "18px",
                margin: "16px 0 24px",
                border: "1px solid #dce9dd",
                borderRadius: "16px",
                background: "#fbfdfb",
              }}
            >
              <h3 style={{ gridColumn: "1 / -1", margin: 0 }}>Add New Product</h3>
              <input
                required
                type="text"
                placeholder="Product name"
                value={newProduct.name}
                onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })}
              />
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Price (₹)"
                value={newProduct.price}
                onChange={(event) => setNewProduct({ ...newProduct, price: event.target.value })}
              />
              <input
                required
                type="number"
                min="0"
                step="1"
                placeholder="Stock quantity"
                value={newProduct.stock}
                onChange={(event) => setNewProduct({ ...newProduct, stock: event.target.value })}
              />
              <select
                value={newProduct.category}
                onChange={(event) => setNewProduct({ ...newProduct, category: event.target.value })}
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
                onChange={(event) => setNewProduct({ ...newProduct, imageUrl: event.target.value })}
              />
              <textarea
                placeholder="Product description (optional)"
                value={newProduct.description}
                onChange={(event) => setNewProduct({ ...newProduct, description: event.target.value })}
                rows={2}
                style={{ resize: "vertical" }}
              />
              <button
                type="submit"
                className="add-btn"
                disabled={savingProduct}
                style={{ gridColumn: "1 / -1", minHeight: "44px" }}
              >
                {savingProduct ? "Adding Product..." : "+ Add Product"}
              </button>
            </form>
          </>
        )}

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

            <button className="add-btn" onClick={() => void fetchProducts()}>

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

                  {product.stock <= 0 || product.available === false ? (

                    <span className="stock-badge">Out of stock</span>

                  ) : (

                    <span className="fresh-badge">Fresh pick</span>

                  )}

                </div>

                <div className="product-info">

                  <span className="product-category">

                    {product.category || "Groceries"}

                  </span>

                  <h3>{product.name}</h3>

                  <p className="product-description">

                    {product.description || "Fresh quality product."}

                  </p>

                  <div className="product-bottom">

                    <div className="product-price">

                      <strong>₹{Number(product.price).toFixed(2)}</strong>

                      <small>{product.stock} available</small>

                    </div>

                    <button

                      className="add-btn"

                      disabled={

                        product.stock <= 0 || product.available === false

                      }

                      onClick={() => addToCart(product)}

                    >

                      {product.stock > 0 && product.available !== false

                        ? "+ Add"

                        : "Unavailable"}

                    </button>

                  </div>

                  {isAdmin && (

                    <div className="stock-editor">

                      <label htmlFor={`stock-${product.id}`}>Update stock</label>

                      <input

                        id={`stock-${product.id}`}

                        type="number"

                        min="0"

                        step="1"

                        value={

                          stockInputs[product.id] ?? String(product.stock)

                        }

                        onChange={(event) =>

                          setStockInputs((current) => ({

                            ...current,

                            [product.id]: event.target.value,

                          }))

                        }

                      />

                      <button

                        type="button"

                        className="add-btn"

                        disabled={savingStock === product.id}

                        onClick={() => void updateStock(product)}

                      >

                        {savingStock === product.id ? "Saving..." : "Save Stock"}

                      </button>

                    </div>

                  )}

                </div>

              </article>

            ))}

          </div>

        )}

      </main>

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

                  <p>₹{Number(item.price).toFixed(2)} each</p>

                </div>

                <div className="quantity">

                  <button

                    aria-label={`Decrease ${item.name}`}

                    onClick={() => changeQuantity(item.id, -1)}

                  >

                    −

                  </button>

                  <span>{item.quantity}</span>

                  <button

                    aria-label={`Increase ${item.name}`}

                    onClick={() => changeQuantity(item.id, 1)}

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

            <strong>₹{cartTotal.toFixed(2)}</strong>

          </div>

          <button className="checkout-btn" onClick={openCheckout}>

            Proceed to Checkout →

          </button>

        </aside>

      )}

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

                  setLoginData({ ...loginData, email: event.target.value })

                }

              />

              <input

                required

                type="password"

                placeholder="Password"

                value={loginData.password}

                onChange={(event) =>

                  setLoginData({ ...loginData, password: event.target.value })

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

                  setSignupData({ ...signupData, name: event.target.value })

                }

              />

              <input

                required

                type="email"

                placeholder="Email address"

                value={signupData.email}

                onChange={(event) =>

                  setSignupData({ ...signupData, email: event.target.value })

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

                  setDelivery({ ...delivery, customerName: event.target.value })

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

                  setDelivery({ ...delivery, phone: event.target.value })

                }

              />

              <input

                required

                type="text"

                placeholder="Delivery address"

                value={delivery.address}

                onChange={(event) =>

                  setDelivery({ ...delivery, address: event.target.value })

                }

              />

              <input

                required

                type="text"

                placeholder="City"

                value={delivery.city}

                onChange={(event) =>

                  setDelivery({ ...delivery, city: event.target.value })

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

                  setDelivery({ ...delivery, pincode: event.target.value })

                }

              />

              <div className="cart-total">

                <span>Order total</span>

                <strong>₹{cartTotal.toFixed(2)}</strong>

              </div>

              <button

                className="modal-btn"

                type="submit"

                disabled={placingOrder}

              >

                {placingOrder ? "Placing Order..." : "Confirm Order"}

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
