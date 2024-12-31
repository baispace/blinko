import React, { useEffect, useState } from "react";
import { Button, Input, Checkbox, Link, Image, Divider } from "@nextui-org/react";
import { Icon } from "@iconify/react";
import { signIn } from "next-auth/react";
import { RootStore } from "@/store";
import { useRouter } from "next/router";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { useTranslation } from "react-i18next";
import { StorageState } from "@/store/standard/StorageState";
import { UserStore } from "@/store/user";
import { ShowTwoFactorModal } from "@/components/Common/TwoFactorModal";
import { DialogStore } from "@/store/module/Dialog";
import { PromiseState } from "@/store/standard/PromiseState";
import { useTheme } from "next-themes";
import { api } from "@/lib/trpc";
import dynamic from 'next/dynamic';

const GradientBackground = dynamic(
  () => import('@/components/Common/GradientBackground').then((mod) => mod.GradientBackground),
  { ssr: false }
);

type OAuthProvider = {
  id: string;
  name: string;
  icon?: string;
};

export default function Component() {
  const router = useRouter()
  const [isVisible, setIsVisible] = React.useState(false);
  const [user, setUser] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [canRegister, setCanRegister] = useState(false)
  const [providers, setProviders] = useState<OAuthProvider[]>([])
  const { theme } = useTheme()
  const { t } = useTranslation()
  const [loadingProvider, setLoadingProvider] = useState<string>('');

  useEffect(() => {
    api.public.oauthProviders.query().then(providers => {
      setProviders(providers)
    })
  }, [])

  const SignIn = new PromiseState({
    function: async () => {
      const res = await signIn('credentials', {
        username: user ?? userStorage.value,
        password: password ?? passwordStorage.value,
        callbackUrl: '/',
        redirect: false,
      })
      return res
    }
  })
  const SignInTwoFactor = new PromiseState({
    function: async (code: string) => {
      const res = await signIn('credentials', {
        username: user ?? userStorage.value,
        password: password ?? passwordStorage.value,
        callbackUrl: '/',
        redirect: false,
        twoFactorCode: code,
        isSecondStep: 'true',
      })
      return res
    }
  })

  const userStorage = new StorageState({ key: 'username' })
  const passwordStorage = new StorageState({ key: 'password' })

  useEffect(() => {
    try {
      RootStore.Get(UserStore).canRegister.call().then(v => {
        setCanRegister(v ?? false)
      })
      if (userStorage.value) {
        setUser(userStorage.value)
      }
      if (passwordStorage.value) {
        setPassword(passwordStorage.value)
      }
    } catch (error) {
    }
  }, [])

  const login = async () => {
    try {
      const res = await SignIn.call()

      if (res?.ok) {
        const session = await fetch('/api/auth/session').then(res => res.json())
        if (session?.requiresTwoFactor) {
          ShowTwoFactorModal(async (code) => {
            const twoFactorRes = await SignInTwoFactor.call(code)
            if (twoFactorRes?.ok) {
              RootStore.Get(DialogStore).close()
              userStorage.setValue(user)
              passwordStorage.setValue(password)
              router.push('/')
            } else {
              RootStore.Get(ToastPlugin).error(twoFactorRes?.error ?? t('user-or-password-error'))
            }
          }, SignInTwoFactor.loading.value)
        } else {
          userStorage.setValue(user)
          passwordStorage.setValue(password)
          router.push('/')
        }
      } else {
        RootStore.Get(ToastPlugin).error(res?.error ?? t('user-or-password-error'))
      }
    } catch (error) {
      console.log(error)
    }
  }

  const handleOAuthLogin = async (providerId: string) => {
    try {
      setLoadingProvider(providerId);
      await signIn(providerId, {
        callbackUrl: '/oauth-callback',
        redirect: true
      });
    } catch (error) {
      console.error('login failed:', error);
      RootStore.Get(ToastPlugin).error(t('login-failed'));
    } finally {
      setLoadingProvider('');
    }
  };

  return (
    <GradientBackground>
      <div className="flex h-full w-screen items-center justify-center p-2 sm:p-4 lg:p-8">
        <div className="flex w-full max-w-sm flex-col gap-4 rounded-large glass-effect px-8 pb-10 pt-6 shadow-large">
          <p className="pb-2 text-xl font-medium flex gap-2 items-center justiy-center">
            Login With <Image src={theme === 'light' ? '/logo-light.png' : '/logo-dark.png'} width={100} radius="none"></Image>
          </p>

          {providers.length > 0 && (
            <>
              <div className="flex flex-col gap-4">
                {providers.map((provider) => (
                  <Button
                    key={provider.id}
                    className="w-full text-primary-foreground"
                    color="primary"
                    variant="bordered"
                    startContent={provider.icon && <Icon icon={provider.icon} className="text-xl" />}
                    isLoading={loadingProvider === provider.id}
                    onPress={() => handleOAuthLogin(provider.id)}
                  >
                    {t('sign-in-with-provider', { provider: provider.name })}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-2 my-2">
                <Divider className="flex-1" />
                <span className="text-sm text-default-400">{t('or')}</span>
                <Divider className="flex-1" />
              </div>
            </>
          )}

          <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
            <Input
              label={t('username')}
              name={t('username')}
              placeholder={t('enter-your-name')}
              type="text"
              variant="bordered"
              value={user}
              onChange={e => setUser(e.target.value?.trim())}
            />
            <Input
              endContent={
                <button type="button" onClick={() => setIsVisible(!isVisible)}>
                  {isVisible ? (
                    <Icon
                      className="pointer-events-none text-2xl text-default-400"
                      icon="solar:eye-closed-linear"
                    />
                  ) : (
                    <Icon
                      className="pointer-events-none text-2xl text-default-400"
                      icon="solar:eye-bold"
                    />
                  )}
                </button>
              }
              label={t('password')}
              name="password"
              placeholder={t('enter-your-password')}
              type={isVisible ? "text" : "password"}
              variant="bordered"
              value={password}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  login()
                }
              }}
              onChange={e => setPassword(e.target.value?.trim())}
            />
            <div className="flex items-center justify-between px-1 pl-2 pr-2">
              <Checkbox defaultSelected name="remember" size="sm">
                {t('keep-sign-in')}
              </Checkbox>
            </div>
            <Button
              color="primary"
              isLoading={SignIn.loading.value}
              onPress={async e => {
                login()
              }}>
              {t('sign-in')}
            </Button>
          </form>
          {
            canRegister && <p className="text-center text-small">
              {t('need-to-create-an-account')}&nbsp;
              <Link href="/signup" size="sm" >
                {t('sign-up')}
              </Link>
            </p>
          }
        </div>
      </div>
    </GradientBackground>
  );
}
