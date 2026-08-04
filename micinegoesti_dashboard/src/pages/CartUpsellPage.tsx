import { useCallback } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { PostAddCrossSellModal } from "../components/PostAddCrossSellModal";
import { useCart } from "../context/CartContext";

export function CartUpsellPage() {
  const { lines } = useCart();
  const navigate = useNavigate();
  const returnToCart = useCallback(() => navigate("/cart"), [navigate]);

  if (!lines.length) return <Navigate to="/cart" replace />;

  return <PostAddCrossSellModal context="cart" onClose={returnToCart} />;
}
