import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import Box from '@etherealengine/ui/src/Box'
import Container from '@etherealengine/ui/src/Container'
import Typography from '@etherealengine/ui/src/Typography'

import { AuthService } from '../../services/AuthService'
import styles from './index.module.scss'

interface Props {
  token: string
}

export const VerifyEmail = ({ token }: Props): JSX.Element => {
  const { t } = useTranslation()

  useEffect(() => {
    AuthService.verifyEmail(token)
  }, [])

  return (
    <Container component="main" maxWidth="md">
      <div className={styles.paper}>
        <Typography component="h1" variant="h5">
          {t('user:auth.verifyEmail.header')}
        </Typography>

        <Box mt={3}>
          <Typography variant="body2" color="textSecondary" align="center">
            {t('user:auth.verifyEmail.processing')}
          </Typography>
        </Box>
      </div>
    </Container>
  )
}
