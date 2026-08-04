import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type { ApiCart, CartLine, Product } from "../api/types";
import { getBrowserSessionId } from "../lib/browserSession";

type CartContextValue = {
  lines: CartLine[];
  lastOrder: CartLine[];
  cartId: string | null;
  sessionId: string;
  count: number;
  subtotal: number;
  add: (product: Product, quantity?: number) => void;
  update: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  replace: (lines: CartLine[]) => void;
  clear: () => void;
  refreshLastOrder: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);
const LEGACY_STORAGE_KEY = "mdn_cart";

function loadLegacyCart() {
  try {
    return JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? "[]") as CartLine[];
  } catch {
    return [];
  }
}

function cartToLines(cart: ApiCart): CartLine[] {
  return cart.items.map((item) => ({
    product: item.product,
    quantity: item.quantity
  }));
}

function linesToItems(lines: CartLine[]) {
  return lines
    .filter((line) => line.product?.id && line.quantity > 0)
    .map((line) => ({
      productId: line.product.id,
      quantity: line.quantity
    }));
}

function warnCartSync(error: unknown) {
  console.warn("Cart sync failed", error);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [sessionId] = useState(getBrowserSessionId);
  const [cartId, setCartId] = useState<string | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [lastOrder, setLastOrder] = useState<CartLine[]>([]);
  const cartIdRef = useRef<string | null>(null);
  const creatingCartRef = useRef<Promise<string> | null>(null);

  const applyCart = useCallback((cart: ApiCart) => {
    cartIdRef.current = cart.id;
    setCartId(cart.id);
    setLines(cartToLines(cart));
  }, []);

  const ensureCart = useCallback(async () => {
    if (cartIdRef.current) return cartIdRef.current;

    creatingCartRef.current ??= api.createCart(sessionId).then((response) => {
      cartIdRef.current = response.cart.id;
      setCartId(response.cart.id);
      return response.cart.id;
    });

    return creatingCartRef.current;
  }, [sessionId]);

  const syncFromServer = useCallback((task: Promise<{ cart: ApiCart }>) => {
    task.then((response) => applyCart(response.cart)).catch(warnCartSync);
  }, [applyCart]);

  const refreshLastOrder = useCallback(async () => {
    const response = await api.lastOrder(sessionId);
    setLastOrder(response.lines);
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateCart() {
      const legacyCart = loadLegacyCart().filter((line) => line.product?.id && line.quantity > 0);

      try {
        const response = await api.createCart(sessionId);
        if (cancelled) return;

        cartIdRef.current = response.cart.id;
        setCartId(response.cart.id);

        if (legacyCart.length > 0 && response.cart.items.length === 0) {
          const migrated = await api.replaceCartItems(response.cart.id, linesToItems(legacyCart));
          if (cancelled) return;
          applyCart(migrated.cart);
        } else {
          applyCart(response.cart);
        }

        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch (error) {
        warnCartSync(error);
        if (!cancelled && legacyCart.length > 0) setLines(legacyCart);
      }

      refreshLastOrder().catch(warnCartSync);
    }

    hydrateCart();

    return () => {
      cancelled = true;
    };
  }, [applyCart, refreshLastOrder, sessionId]);

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((sum, line) => sum + line.quantity, 0);
    const subtotal = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);

    return {
      lines,
      lastOrder,
      cartId,
      sessionId,
      count,
      subtotal,
      add: (product, quantity = 1) => {
        const safeQuantity = Math.max(1, Math.floor(quantity));
        setLines((current) => {
          const existing = current.find((line) => line.product.id === product.id);
          if (!existing) return [...current, { product, quantity: safeQuantity }];
          return current.map((line) =>
            line.product.id === product.id ? { ...line, quantity: line.quantity + safeQuantity } : line
          );
        });

        void ensureCart()
          .then((id) => syncFromServer(api.addCartItem(id, { productId: product.id, quantity: safeQuantity })))
          .catch(warnCartSync);
      },
      update: (productId, quantity) => {
        const safeQuantity = Math.max(0, Math.floor(quantity));
        setLines((current) =>
          current
            .map((line) => (line.product.id === productId ? { ...line, quantity: safeQuantity } : line))
            .filter((line) => line.quantity > 0)
        );

        void ensureCart()
          .then((id) =>
            safeQuantity > 0
              ? syncFromServer(api.updateCartItemByProduct(id, productId, safeQuantity))
              : syncFromServer(api.removeCartItemByProduct(id, productId))
          )
          .catch(warnCartSync);
      },
      remove: (productId) => {
        setLines((current) => current.filter((line) => line.product.id !== productId));
        void ensureCart()
          .then((id) => syncFromServer(api.removeCartItemByProduct(id, productId)))
          .catch(warnCartSync);
      },
      replace: (nextLines) => {
        const normalizedLines = nextLines.filter((line) => line.product?.id && line.quantity > 0);
        setLines(normalizedLines);
        void ensureCart()
          .then((id) => syncFromServer(api.replaceCartItems(id, linesToItems(normalizedLines))))
          .catch(warnCartSync);
      },
      clear: () => {
        setLines([]);
        void ensureCart()
          .then((id) => syncFromServer(api.clearCart(id)))
          .catch(warnCartSync);
      },
      refreshLastOrder
    };
  }, [cartId, ensureCart, lastOrder, lines, refreshLastOrder, sessionId, syncFromServer]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
