'use client';

import { ToastContainer, toast, ToastOptions } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const defaultOptions: ToastOptions = {
    position: 'top-right',
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    theme: 'dark',
};

export const showSuccess = (message: string) => {
    toast.success(message, defaultOptions);
};

export const showError = (message: string) => {
    toast.error(message, {
        ...defaultOptions,
        autoClose: 8000,
    });
};

export const showWarning = (message: string) => {
    toast.warning(message, defaultOptions);
};

export const showInfo = (message: string) => {
    toast.info(message, defaultOptions);
};

export default function Notification() {
    return (
        <ToastContainer
            position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="dark"
            style={{ zIndex: 9999 }}
        />
    );
}
