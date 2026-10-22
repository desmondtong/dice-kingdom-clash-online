import { useEffect, useState } from "react";
export default function ErrorToast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 4_000);
    return () => clearTimeout(timer);
  }, []);
  return visible ? (
    <p className="error-toast" role="alert">
      {message}
    </p>
  ) : null;
}
