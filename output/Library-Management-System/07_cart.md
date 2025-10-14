# Section 7: Cart

## Overview

The `Cart` component is a page-level component that serves as the user's shopping cart. It displays a list of books added by the user, allows for quantity adjustments and item removal, calculates and displays the total price, and provides a checkout function. This component is designed to be a distinct route within the application.

## Public API

The `Cart` component's primary interface is the component itself and the data structure it consumes.

### Component

**`<Cart />`**

A self-contained page component. It currently takes no props as its state is managed internally.

### Types

**`CartItem`**

The interface defining the structure for each item within the cart.

```typescript
interface CartItem {
  id: number;
  title: string;
  author: string;
  coverImage: string;
  price: number; // Price in smallest currency unit (e.g., paise, cents)
  quantity: number;
}
```

## How It Works

The component manages its state using the `React.useState` hook, which holds an array of `CartItem` objects. All cart manipulations are synchronous operations on this local state.

1.  **State Initialization**: The `cartItems` state is initialized with mock data for demonstration. In a production build, this would be initialized from a global state manager or local storage.
2.  **Rendering**:
    - If `cartItems` is not empty, it maps over the array to render each item's details, quantity controls, and a remove button.
    - If `cartItems` is empty, it displays a message and a link to the books page.
3.  **State Manipulation**: User interactions trigger handler functions that update the component's state:
    - `updateQuantity(id, newQuantity)`: Finds the item by `id` and updates its `quantity`.
    - `removeFromCart(id)`: Filters the `cartItems` array, removing the item with the matching `id`.
    - `checkout()`: Clears the `cartItems` array by setting it to `[]`.
4.  **Derived State**: The `total` price is calculated on every render by reducing the `cartItems` array, ensuring it is always in sync with the current state.

```mermaid
graph TD
    subgraph User Actions
        A[Click +/-]
        B[Click Remove]
        C[Click Checkout]
    end

    subgraph Handlers
        H1[updateQuantity()]
        H2[removeFromCart()]
        H3[checkout()]
    end

    subgraph State
        S[cartItems state]
    end

    subgraph UI
        U[Render Cart List]
        V[Render Total]
    end

    A --> H1
    B --> H2
    C --> H3
    H1 --> S
    H2 --> S
    H3 --> S
    S -- Triggers re-render --> U
    S -- Triggers re-render --> V
```

## Integration Steps

To integrate the `Cart` component, it should be added as a route in the application's router configuration (e.g., using `react-router-dom`).

1.  **Import the component**:
    ```javascript
    import Cart from './pages/Cart';
    ```

2.  **Add to router**:
    ```jsx
    // In your main App or Router component
    <Routes>
      {/* ... other routes */}
      <Route path="/cart" element={<Cart />} />
    </Routes>
    ```

3.  **State Management**:
    The current implementation uses hardcoded local state. For a functional application, replace the `React.useState` initialization with a connection to a global state management solution (e.g., React Context, Redux, Zustand). This allows other components, such as `BookCard`, to add items to the cart.

    **Example (Conceptual - with Context):**
    ```jsx
    // src/pages/Cart.tsx
    // import { useCart } from '../context/CartContext'; // Hypothetical context
    const Cart = () => {
        // const { cartItems, setCartItems, removeFromCart, updateQuantity, checkout } = useCart();
        // ... rest of the component logic
    }
    ```

## Error Handling and Edge Cases

-   **Quantity Validation**: The `updateQuantity` function prevents quantities from being set to less than 1, ensuring data integrity.
-   **Empty Cart**: The component provides a clear UI state when the cart is empty, including a call-to-action to browse books.
-   **Notifications**: User-facing feedback for actions like removing an item or checking out is handled via `useToast` from Chakra UI, providing non-blocking status updates.
-   **State Persistence**: The current implementation does not persist the cart state. The state will be lost on a page refresh. For persistence, integrate with `localStorage` or a backend service.

## Examples

### Minimal Router Integration

This example demonstrates how to set up a route for the `Cart` page within a basic React application using `react-router-dom` and `ChakraProvider`.

```jsx
// src/App.tsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import Cart from './pages/Cart';
import Home from './pages/Home';

const App = () => {
  return (
    <ChakraProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cart" element={<Cart />} />
        </Routes>
      </Router>
    </ChakraProvider>
  );
};

export default App;
```

## Related Components

-   [Books](05_books.md): The page where users browse and select items to add to the cart.
-   [BookCard](08_bookcard.md): The component responsible for displaying a single book, which would typically contain the "Add to Cart" functionality.
-   [formatPrice](10_formatprice.md): The utility function used to format currency values displayed in the cart.

## File References

-   `src/pages/Cart.tsx`: The primary file containing the `Cart` component's implementation.

---

Generated by [AI Codebase Knowledge Builder](https://github.com/The-Pocket/Tutorial-Codebase-Knowledge)