import { GoogleLogin } from "@react-oauth/google";
import { jwtDecode } from "jwt-decode";

const GoogleLoginButton = ({ onLoginSuccess }) => {
  return (
    <GoogleLogin
      onSuccess={(credentialResponse) => {
        if (!credentialResponse.credential) return;

        // decode token to get user info
        const user = jwtDecode(credentialResponse.credential);
        // store minimal info for backend calls
        try {
          if (user && user.email) {
            localStorage.setItem("userEmail", user.email);
          }
        } catch (e) {
          console.warn("Unable to write userEmail to localStorage", e);
        }

        onLoginSuccess(user);
      }}
      onError={() => {
        console.log("Google Login Failed");
      }}
    />
  );
};

export default GoogleLoginButton;
