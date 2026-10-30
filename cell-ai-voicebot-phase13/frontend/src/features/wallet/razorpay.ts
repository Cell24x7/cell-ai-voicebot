export const RAZORPAY_CHECKOUT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
const TIMEOUT_MS = 15_000;

let loading: Promise<void> | null = null;

/**
 * Loads Razorpay Checkout once (script tag injected on first use). Rejects
 * after 15 s or on a load error — the next call tries again.
 */
export const loadRazorpayCheckout = (): Promise<void> => {
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_URL;
    script.async = true;
    const fail = (message: string) => {
      clearTimeout(timer);
      script.remove();
      loading = null;
      reject(new Error(message));
    };
    const timer = setTimeout(
      () => fail('The payment window took too long to load. Check your connection and try again.'),
      TIMEOUT_MS,
    );
    script.onload = () => {
      clearTimeout(timer);
      if (window.Razorpay) resolve();
      else fail('The payment window could not start. Please try again.');
    };
    script.onerror = () => fail('The payment window could not be loaded. Please try again.');
    document.head.appendChild(script);
  });
  return loading;
};

/** Tests only. */
export const resetRazorpayLoader = (): void => {
  loading = null;
};
