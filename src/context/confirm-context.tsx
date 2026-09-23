'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { ConfirmModal } from '@/components/modals/confirm-modal';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'primary';
}

export interface AlertOptions {
  title?: string;
  message: string;
  confirmText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'primary';
}

export interface PromptOptions {
  title?: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  prompt: (options: PromptOptions | string, defaultValue?: string) => Promise<string | null>;
  alert: (options: AlertOptions | string) => Promise<void>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    variant: 'danger' | 'warning' | 'info' | 'primary';
    isPrompt: boolean;
    defaultValue: string;
    inputPlaceholder: string;
  }>({
    isOpen: false,
    title: 'Confirm Action',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'danger',
    isPrompt: false,
    defaultValue: '',
    inputPlaceholder: '',
  });

  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  const promptResolverRef = useRef<((value: string | null) => void) | null>(null);
  const alertResolverRef = useRef<(() => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string) => {
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      if (typeof options === 'string') {
        setModalState({
          isOpen: true,
          title: 'Confirm Action',
          message: options,
          confirmText: 'Confirm',
          cancelText: 'Cancel',
          variant: 'danger',
          isPrompt: false,
          defaultValue: '',
          inputPlaceholder: '',
        });
      } else {
        setModalState({
          isOpen: true,
          title: options.title || 'Confirm Action',
          message: options.message,
          confirmText: options.confirmText || 'Confirm',
          cancelText: options.cancelText || 'Cancel',
          variant: options.variant || 'danger',
          isPrompt: false,
          defaultValue: '',
          inputPlaceholder: '',
        });
      }
    });
  }, []);

  const prompt = useCallback((options: PromptOptions | string, defaultVal?: string) => {
    return new Promise<string | null>((resolve) => {
      promptResolverRef.current = resolve;
      if (typeof options === 'string') {
        setModalState({
          isOpen: true,
          title: options,
          message: '',
          confirmText: 'Save',
          cancelText: 'Cancel',
          variant: 'primary',
          isPrompt: true,
          defaultValue: defaultVal || '',
          inputPlaceholder: '',
        });
      } else {
        setModalState({
          isOpen: true,
          title: options.title || 'Input Required',
          message: options.message || '',
          confirmText: options.confirmText || 'Save',
          cancelText: options.cancelText || 'Cancel',
          variant: 'primary',
          isPrompt: true,
          defaultValue: options.defaultValue || defaultVal || '',
          inputPlaceholder: options.placeholder || '',
        });
      }
    });
  }, []);

  const alert = useCallback((options: AlertOptions | string) => {
    return new Promise<void>((resolve) => {
      alertResolverRef.current = resolve;
      if (typeof options === 'string') {
        setModalState({
          isOpen: true,
          title: 'Notification',
          message: options,
          confirmText: 'OK',
          cancelText: '',
          variant: 'info',
          isPrompt: false,
          defaultValue: '',
          inputPlaceholder: '',
        });
      } else {
        setModalState({
          isOpen: true,
          title: options.title || 'Notification',
          message: options.message,
          confirmText: options.confirmText || 'OK',
          cancelText: '',
          variant: options.variant || 'info',
          isPrompt: false,
          defaultValue: '',
          inputPlaceholder: '',
        });
      }
    });
  }, []);

  const handleConfirm = useCallback((value?: string) => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
    if (alertResolverRef.current) {
      alertResolverRef.current();
      alertResolverRef.current = null;
    }
    if (promptResolverRef.current) {
      promptResolverRef.current(value !== undefined ? value : '');
      promptResolverRef.current = null;
    }
    if (confirmResolverRef.current) {
      confirmResolverRef.current(true);
      confirmResolverRef.current = null;
    }
  }, []);

  const handleCancel = useCallback(() => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
    if (alertResolverRef.current) {
      alertResolverRef.current();
      alertResolverRef.current = null;
    }
    if (promptResolverRef.current) {
      promptResolverRef.current(null);
      promptResolverRef.current = null;
    }
    if (confirmResolverRef.current) {
      confirmResolverRef.current(false);
      confirmResolverRef.current = null;
    }
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm, prompt, alert }}>
      {children}
      <ConfirmModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        message={modalState.message}
        confirmText={modalState.confirmText}
        cancelText={modalState.cancelText}
        variant={modalState.variant}
        isPrompt={modalState.isPrompt}
        defaultValue={modalState.defaultValue}
        inputPlaceholder={modalState.inputPlaceholder}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  );
};

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    return {
      confirm: async (options: ConfirmOptions | string) => {
        const msg = typeof options === 'string' ? options : options.message;
        return window.confirm(msg);
      },
      prompt: async (options: PromptOptions | string, defaultVal?: string) => {
        const title = typeof options === 'string' ? options : (options.title || options.message || '');
        const val = typeof options === 'string' ? defaultVal : (options.defaultValue || defaultVal);
        return window.prompt(title, val);
      },
      alert: async (options: AlertOptions | string) => {
        const msg = typeof options === 'string' ? options : options.message;
        window.alert(msg);
      },
    };
  }
  return ctx;
}
